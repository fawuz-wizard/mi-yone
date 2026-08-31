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
    db.flush()  # plain-FK models don't order inserts — the user row must exist first
    business = None
    if body.business_name and body.business_name.strip():
        business = Business(id=gen_id("b"), name=body.business_name.strip())
        db.add(business)
        db.flush()
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
    return ok({"user": {"name": user.full_name, "phone": user.phone, "email": user.email},
               "business": _business_json(business) if business else None})


# ---------------------------------------------------------------------------
# Settings center (owner brief): profile, password, sessions — all on the
# EXISTING opaque-session architecture. No second auth system.
# ---------------------------------------------------------------------------

class UpdateMeInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)


@router.patch("/me")
def update_me(body: UpdateMeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name is not None and body.name.strip():
        user.full_name = body.name.strip()
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.email is not None and body.email.strip():
        email = body.email.strip().lower()
        if email != user.email:
            if "@" not in email or db.scalar(select(User).where(User.email == email)) is not None:
                raise ApiError(422, "VALIDATION_ERROR", "That email can't be used.")
            user.email = email
    audit(db, None, user.full_name, "auth.profile_update", "user", user.id)
    business = _first_business(db, user)
    return ok({"user": {"name": user.full_name, "phone": user.phone, "email": user.email},
               "business": _business_json(business) if business else None})


class ChangePasswordInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


@router.post("/change-password")
def change_password(
    body: ChangePasswordInput, request: Request,
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    if not verify_password(user.password_hash, body.current_password):
        raise ApiError(422, "VALIDATION_ERROR", "The current password is not correct.")
    user.password_hash = hash_password(body.new_password)
    # Changing the password signs out every OTHER device — the standard
    # protective move; this session continues.
    token = request.cookies.get(settings.session_cookie)
    current_hash = hash_token(token) if token else None
    for s in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))):
        if s.token_hash != current_hash:
            s.revoked_at = utcnow()
    audit(db, None, user.full_name, "auth.password_change", "user", user.id)
    return ok({})


@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    token = request.cookies.get(settings.session_cookie)
    current_hash = hash_token(token) if token else None
    now = utcnow()
    rows = [
        s for s in db.scalars(
            select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .order_by(AuthSession.created_at.desc())
        )
        if s.expires_at > now
    ]
    return ok({
        "sessions": [
            {"id": s.id, "created_at": s.created_at.isoformat(), "current": s.token_hash == current_hash}
            for s in rows
        ]
    })


@router.post("/sessions/sign-out-others")
def sign_out_others(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    token = request.cookies.get(settings.session_cookie)
    current_hash = hash_token(token) if token else None
    count = 0
    for s in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))):
        if s.token_hash != current_hash:
            s.revoked_at = utcnow()
            count += 1
    audit(db, None, user.full_name, "auth.signout_others", "user", user.id, str(count))
    return ok({"signed_out": count})
