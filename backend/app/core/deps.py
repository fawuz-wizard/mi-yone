"""Auth + tenant guard dependencies (Phase 2 §5/§17).
Every tenant route resolves: token → live session → user → ACTIVE membership for
the path's business_id. Missing membership = 404 (never confirm existence)."""
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AuthSession, Business, BusinessMember, User, utcnow
from .config import settings
from .db import get_db
from .envelope import ApiError
from .security import hash_token


def _bearer_or_cookie(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get(settings.session_cookie)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _bearer_or_cookie(request)
    if not token:
        raise ApiError(401, "AUTH_REQUIRED", "Please sign in.")
    now = utcnow()
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at < now
        or session.absolute_expires_at < now
    ):
        raise ApiError(401, "AUTH_INVALID", "Please sign in again to keep your records safe.")
    # Sliding expiry (30d), capped at the absolute limit (90d).
    session.expires_at = min(now + timedelta(days=settings.session_ttl_days), session.absolute_expires_at)
    user = db.get(User, session.user_id)
    if user is None or user.status != "ACTIVE":
        raise ApiError(401, "AUTH_INVALID", "Please sign in again to keep your records safe.")
    return user


@dataclass
class TenantContext:
    user: User
    business: Business
    membership: BusinessMember


def tenant(bid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TenantContext:
    membership = db.scalar(
        select(BusinessMember).where(
            BusinessMember.business_id == bid,
            BusinessMember.user_id == user.id,
            BusinessMember.status == "ACTIVE",
        )
    )
    if membership is None:
        raise ApiError(404, "TENANT_NOT_FOUND", "Business not found.")
    business = db.get(Business, bid)
    if business is None or business.status != "ACTIVE":
        raise ApiError(404, "TENANT_NOT_FOUND", "Business not found.")
    return TenantContext(user=user, business=business, membership=membership)
