from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..core import ratelimit
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.config import settings
from ..core.db import get_db
from ..core.envelope import ApiError, ok
from ..core.security import hash_password, hash_token, new_session_token, verify_password
from ..core.deps import current_user
from ..models import AuthSession, Business, BusinessMember, User, utcnow
from ..services.finance import audit
from ..services.seed_categories import seed_categories

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginInput(BaseModel):
    identifier: str = Field(default="", max_length=255)
    password: str = Field(default="", max_length=200)


class RegisterInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=10, max_length=200)
    business_name: str | None = Field(default=None, max_length=120)


def _first_business(db: Session, user: User) -> Business | None:
    membership = db.scalar(
        select(BusinessMember).where(BusinessMember.user_id == user.id, BusinessMember.status == "ACTIVE")
    )
    return db.get(Business, membership.business_id) if membership else None


def _business_json(b: Business) -> dict:
    return {"id": b.id, "name": b.name, "currency": b.currency, "initial": b.name[:1].upper()}


def _start_session(db: Session, response, user: User) -> None:
    token = new_session_token()
    now = utcnow()
    db.add(
        AuthSession(
            id=gen_id("sess"),
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=settings.session_ttl_days),
            absolute_expires_at=now + timedelta(days=settings.session_absolute_cap_days),
        )
    )
    response.set_cookie(
        settings.session_cookie,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_days * 86400,
        path="/",
    )


@router.post("/login")
def login(body: LoginInput, request: Request, db: Session = Depends(get_db)):
    identifier = body.identifier.strip().lower()
    ip = request.client.host if request.client else "?"
    # Rate limits BEFORE verification. Per-IP is generous (60/min) because many
    # legitimate users share carrier-NAT IPs; the per-identifier failure limit
    # (5 failures / 5 min) is the real credential-stuffing guard.
    if not ratelimit.allow(f"login-ip:{ip}", 60, 60) or not ratelimit.allow(f"login-id:{identifier}", 5, 300):
        audit(db, None, identifier or "?", "auth.rate_limited")
        raise ApiError(429, "RATE_LIMITED", "Too many attempts. Please wait a moment and try again.")
    ratelimit.record(f"login-ip:{ip}")
    user = db.scalar(select(User).where(User.email == identifier))
    # Uniform failure — no user enumeration (Phase 2 §17).
    if user is None or not verify_password(user.password_hash, body.password):
        ratelimit.record(f"login-id:{identifier}")
        audit(db, None, identifier or "?", "auth.login_failed")
        raise ApiError(401, "AUTH_INVALID", "We couldn't sign you in. Check your details and try again.")
    ratelimit.reset(f"login-id:{identifier}")
    business = _first_business(db, user)
    if business is None:
        raise ApiError(401, "AUTH_INVALID", "We couldn't sign you in. Check your details and try again.")
    audit(db, business.id, user.full_name, "auth.login")
    response = ok({"user": {"name": user.full_name}, "business": _business_json(business)})
    _start_session(db, response, user)
    return response


@router.post("/register")
def register(body: RegisterInput, db: Session = Depends(get_db)):
    identifier = body.identifier.strip().lower()
    if not body.name.strip() or not identifier or len(body.password) < 10:
        raise ApiError(422, "VALIDATION_ERROR", "Some of the information is invalid.")
    if db.scalar(select(User).where(User.email == identifier)) is not None:
        # Same generic surface as other validation failures (no enumeration).
        raise ApiError(422, "VALIDATION_ERROR", "Some of the information is invalid.")
    user = User(id=gen_id("u"), email=identifier, password_hash=hash_password(body.password), full_name=body.name.strip())
    db.add(user)
    business = None
    if body.business_name and body.business_name.strip():
        business = Business(id=gen_id("b"), name=body.business_name.strip())
        db.add(business)
        db.add(BusinessMember(id=gen_id("bm"), business_id=business.id, user_id=user.id, role="OWNER"))
        seed_categories(db, business.id)
    audit(db, business.id if business else None, user.full_name, "auth.register")
    response = ok(
        {"user": {"name": user.full_name}, "business": _business_json(business) if business else None},
        status_code=201,
    )
    _start_session(db, response, user)
    return response


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(settings.session_cookie)
    if token:
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        if session:
            session.revoked_at = utcnow()
    response = ok({})
    response.delete_cookie(settings.session_cookie, path="/")
    return response


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    business = _first_business(db, user)
    return ok({"user": {"name": user.full_name}, "business": _business_json(business) if business else None})
