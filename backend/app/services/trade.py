"""Sales orchestration + debt settlements (Phase 2 M6/M7).
A sale coordinates finance + inventory + customers atomically. Debt settlements
create the cash transaction and update the debt in one unit of work."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.envelope import ApiError
from ..models import Debt, Party, Product, Sale, Transaction, utcnow
from .finance import audit, create_transaction
from .inventory import add_movement


def create_sale(
    db: Session,
    business_id: str,
    actor: str,
    *,
    amount_minor: int,
    product_id: str | None,
    quantity: int | None,
    payment: str,
    amount_paid_minor: int | None,
    customer_id: str | None,
    description: str | None,
    idempotency_key: str | None,
) -> tuple[dict, bool]:
    if not isinstance(amount_minor, int) or amount_minor <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "The amount is invalid.")
    if idempotency_key:
        existing = db.scalar(select(Sale).where(Sale.business_id == business_id, Sale.idempotency_key == idempotency_key))
        if existing:
            cash = db.get(Transaction, existing.cash_transaction_id) if existing.cash_transaction_id else None
            receivable = db.get(Debt, existing.receivable_id) if existing.receivable_id else None
            return {"sale": existing, "transaction": cash, "receivable": receivable}, True

    total = amount_minor
    paid = total if payment == "PAID" else 0 if payment == "CREDIT" else min(max(amount_paid_minor or 0, 0), total)
    credit = total - paid
    if credit > 0 and not customer_id:
        raise ApiError(422, "VALIDATION_ERROR", "This sale could not be recorded.")

    product = None
    if product_id:
        product = db.scalar(select(Product).where(Product.id == product_id, Product.business_id == business_id))
    if product and product.track_inventory:
        add_movement(db, business_id, product.id, actor, "SALE", -(quantity or 1), None)

    cash_tx = None
    if paid > 0:
        cash_tx, _ = create_transaction(
            db, business_id, actor,
            type_="INCOME", amount_minor=paid,
            description=description or (product.name if product else None),
            counterparty_id=customer_id, source="SALE",
            idempotency_key=f"{idempotency_key}:cash" if idempotency_key else None,
        )
    receivable = None
    if credit > 0:
        customer = db.scalar(select(Party).where(Party.id == customer_id, Party.business_id == business_id, Party.kind == "customer"))
        if customer is None:
            raise ApiError(422, "VALIDATION_ERROR", "This sale could not be recorded.")
        receivable = Debt(id=gen_id("r"), business_id=business_id, kind="receivable", counterparty_id=customer.id, amount_minor=credit, settled_minor=0, since=utcnow(), due_date=None, source="SALE")
        db.add(receivable)

    sale = Sale(
        id=gen_id("s"),
        business_id=business_id,
        total_minor=total,
        occurred_at=utcnow(),
        idempotency_key=idempotency_key,
        cash_transaction_id=cash_tx.id if cash_tx else None,
        receivable_id=receivable.id if receivable else None,
    )
    db.add(sale)
    audit(db, business_id, actor, "sale.create", "sale", sale.id)
    db.flush()
    return {"sale": sale, "transaction": cash_tx, "receivable": receivable}, False


def settle_debt(db: Session, business_id: str, actor: str, debt_id: str, amount_minor: int) -> tuple[Debt, Transaction]:
    debt = db.scalar(select(Debt).where(Debt.id == debt_id, Debt.business_id == business_id))
    if debt is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    outstanding = debt.amount_minor - debt.settled_minor
    if not isinstance(amount_minor, int) or amount_minor <= 0 or amount_minor > outstanding:
        raise ApiError(422, "VALIDATION_ERROR", "The payment is more than what is owed.")
    party = db.get(Party, debt.counterparty_id)
    debt.settled_minor += amount_minor
    is_receivable = debt.kind == "receivable"
    tx, _ = create_transaction(
        db, business_id, actor,
        type_="INCOME" if is_receivable else "EXPENSE",
        amount_minor=amount_minor,
        description=(f"Payment from {party.name}" if is_receivable else f"Payment to {party.name}") if party else None,
        counterparty_id=debt.counterparty_id,
        source="SETTLEMENT",
    )
    audit(db, business_id, actor, "debt.settle", "debt", debt.id, f"{amount_minor}")
    return debt, tx


def add_manual_debt(db: Session, business_id: str, actor: str, kind: str, counterparty_id: str, amount_minor: int) -> Debt:
    party_kind = "customer" if kind == "receivable" else "supplier"
    party = db.scalar(select(Party).where(Party.id == counterparty_id, Party.business_id == business_id, Party.kind == party_kind))
    if party is None or not isinstance(amount_minor, int) or amount_minor <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "This debt could not be recorded.")
    debt = Debt(id=gen_id("r" if kind == "receivable" else "pay"), business_id=business_id, kind=kind, counterparty_id=party.id, amount_minor=amount_minor, settled_minor=0, since=utcnow(), due_date=None, source="MANUAL")
    db.add(debt)
    audit(db, business_id, actor, "debt.manual", "debt", debt.id)
    db.flush()
    return debt
