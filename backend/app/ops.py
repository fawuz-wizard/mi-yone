"""Operations CLI — deployment tooling, NOT product functionality. No UI.

    python -m app.ops set-password <identifier>   # prompts for the new password (hidden)
    python -m app.ops list-users                  # identifiers + business names, nothing else

set-password exists because the first tester round has no password-reset
feature (owner decision: manual credential management). It uses the SAME
argon2id hasher and the SAME password rule (>= 10 characters) as sign-up, and
revokes every existing session for that account — a reset that left old
sessions alive would defeat its purpose. The password is never echoed, never
logged, never accepted as a command-line argument.

Run it where the database is reachable: the platform shell of the API service,
or locally with MIYONE_DATABASE_URL pointing at the target database.
"""
from __future__ import annotations

import getpass
import sys

from sqlalchemy import select

from .core.db import SessionLocal
from .core.security import hash_password
from .models import AuthSession, Business, BusinessMember, User, utcnow
from .services.finance import audit

MIN_PASSWORD = 10  # mirrors RegisterInput / change-password


def set_password(identifier: str) -> int:
    identifier = identifier.strip().lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == identifier))
        if user is None:
            print(f"No account with identifier {identifier!r}.", file=sys.stderr)
            return 1
        print(f"Setting a new password for {user.full_name} ({identifier}).")
        pw1 = getpass.getpass("New password (min 10 characters, not shown): ")
        if len(pw1) < MIN_PASSWORD:
            print(f"Too short: at least {MIN_PASSWORD} characters.", file=sys.stderr)
            return 2
        pw2 = getpass.getpass("Repeat it: ")
        if pw1 != pw2:
            print("The two entries differ. Nothing changed.", file=sys.stderr)
            return 2
        user.password_hash = hash_password(pw1)
        revoked = 0
        for s in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))):
            s.revoked_at = utcnow()
            revoked += 1
        audit(db, None, "ops", "auth.password_set_by_operator", "user", user.id)
        db.commit()
    print(f"Done. Password updated and {revoked} active session(s) signed out. The owner signs in with the new password.")
    return 0


def list_users() -> int:
    with SessionLocal() as db:
        rows = db.execute(
            select(User.email, User.full_name, User.status, Business.name)
            .outerjoin(BusinessMember, BusinessMember.user_id == User.id)
            .outerjoin(Business, Business.id == BusinessMember.business_id)
            .order_by(User.email)
        ).all()
    for email, name, status, biz in rows:
        print(f"{email:40} {name:24} {status:8} {biz or '-'}")
    print(f"{len(rows)} row(s).")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "set-password":
        return set_password(argv[1])
    if argv == ["list-users"]:
        return list_users()
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
