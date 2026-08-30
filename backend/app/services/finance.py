"""Finance service — the immutable ledger (Phase 2 §8).
No UPDATE of financial fields, no DELETE. Corrections/removals are reversals."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.envelope import ApiError
from ..models import AuditEvent, Category, Transaction, utcnow

AMOUNT_CAP_MINOR = 100_000_000_000


def audit(db: Session, business_id: str | None, actor: str, action: str, entity_type: str | None = None, entity_id: str | None = None, detail: str | None = None):
    db.add(AuditEvent(id=gen_id("ae"), business_id=business_id, actor=actor, action=action, entity_type=entity_type, entity_id=entity_id, detail=detail))


def category_name(db: Session, business_id: str, category_id: str | None, kind: str) -> str:
    if category_id:
        cat = db.scalar(select(Category).where(Category.id == category_id, Category.business_id == business_id, Category.kind == kind))
        if cat:
            return cat.name
    return "Sales" if kind == "INCOME" else "General expense"


def parse_occurred_at(raw: str | None) -> datetime:
    """Backdating allowed, future dates are not; created_at never lies (§7)."""
    now = utcnow()
    if not raw:
        return now
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return now
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed if parsed <= now else now


def create_transaction(
    db: Session,
    business_id: str,
    actor: str,
    *,
    type_: str,
    amount_minor: int,
    category_id: str | None = None,
    description: str | None = None,
    occurred_at: str | None = None,
    counterparty_id: str | None = None,
    source: str = "MANUAL",
    idempotency_key: str | None = None,
    entry_method: str = "manual",
) -> tuple[Transaction, bool]:
    if entry_method not in ("manual", "text", "voice", "scan"):
        entry_method = "manual"
    if not isinstance(amount_minor, int) or amount_minor <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "The amount is invalid.")
    if amount_minor > AMOUNT_CAP_MINOR:
        raise ApiError(422, "VALIDATION_ERROR", "The amount is larger than expected.")
    if idempotency_key:
        existing = db.scalar(
            select(Transaction).where(Transaction.business_id == business_id, Transaction.idempotency_key == idempotency_key)
        )
        if existing:
            return existing, True
    t = Transaction(
        id=gen_id("t"),
        business_id=business_id,
        type=type_,
        status="POSTED",
        amount_minor=amount_minor,
        category_name=category_name(db, business_id, category_id, type_),
        description=description or None,
        occurred_at=parse_occurred_at(occurred_at),
        created_at=utcnow(),
        recorded_by=actor,
        source=source,
        entry_method=entry_method,
        counterparty_id=counterparty_id,
        idempotency_key=idempotency_key,
    )
    db.add(t)
    audit(db, business_id, actor, "transaction.create", "transaction", t.id)
    db.flush()
    return t, False


def _posted(db: Session, business_id: str, tx_id: str) -> Transaction:
    t = db.scalar(select(Transaction).where(Transaction.id == tx_id, Transaction.business_id == business_id))
    if t is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    if t.status != "POSTED":
        raise ApiError(409, "CONFLICT", "This record was already fixed or removed.")
    return t


def reverse_transaction(db: Session, business_id: str, actor: str, tx_id: str) -> None:
    original = _posted(db, business_id, tx_id)
    original.status = "REVERSED"
    now = utcnow()
    db.add(
        Transaction(
            id=gen_id("t"),
            business_id=business_id,
            type=original.type,
            status="POSTED",
            amount_minor=original.amount_minor,
            category_name=original.category_name,
            description=original.description,
            occurred_at=now,
            created_at=now,
            recorded_by=actor,
            source=original.source,
            counterparty_id=original.counterparty_id,
            reverses_transaction_id=original.id,
        )
    )
    audit(db, business_id, actor, "transaction.reverse", "transaction", original.id)


def fix_transaction(
    db: Session,
    business_id: str,
    actor: str,
    tx_id: str,
    *,
    amount_minor: int | None = None,
    category_id: str | None = None,
    description: str | None = None,
    occurred_at: str | None = None,
) -> Transaction:
    """One client-facing 'fix' = reversal + corrected record, atomically."""
    original = _posted(db, business_id, tx_id)
    new_amount = amount_minor if amount_minor is not None else original.amount_minor
    if new_amount <= 0 or new_amount > AMOUNT_CAP_MINOR:
        raise ApiError(422, "VALIDATION_ERROR", "The corrected amount is invalid.")
    original.status = "REVERSED"
    now = utcnow()
    db.add(
        Transaction(
            id=gen_id("t"),
            business_id=business_id,
            type=original.type,
            status="POSTED",
            amount_minor=original.amount_minor,
            category_name=original.category_name,
            description=original.description,
            occurred_at=now,
            created_at=now,
            recorded_by=actor,
            source=original.source,
            counterparty_id=original.counterparty_id,
            reverses_transaction_id=original.id,
        )
    )
    corrected = Transaction(
        id=gen_id("t"),
        business_id=business_id,
        type=original.type,
        status="POSTED",
        amount_minor=new_amount,
        category_name=category_name(db, business_id, category_id, original.type) if category_id else original.category_name,
        description=(description or None) if description is not None else original.description,
        occurred_at=parse_occurred_at(occurred_at) if occurred_at else original.occurred_at,
        created_at=now,
        recorded_by=original.recorded_by,
        source=original.source,
        counterparty_id=original.counterparty_id,
        fixed_by=actor,
        fixed_was_minor=original.amount_minor,
        fixed_now_minor=new_amount,
    )
    db.add(corrected)
    audit(db, business_id, actor, "transaction.fix", "transaction", original.id, f"->{corrected.id}")
    db.flush()
    return corrected


def visible_query(business_id: str):
    return select(Transaction).where(
        Transaction.business_id == business_id,
        Transaction.status == "POSTED",
        Transaction.reverses_transaction_id.is_(None),
    )
