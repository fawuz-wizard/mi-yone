"""Sales orchestration + debt settlements (Phase 2 M6/M7).
A sale coordinates finance + inventory + customers atomically. Debt settlements
create the cash transaction and update the debt in one unit of work."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.envelope import ApiError
from ..models import Debt, Party, Product, Sale, StockMovement, Transaction, utcnow
from ..serializers import stock_of
from .finance import audit, create_transaction, reverse_transaction
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
    entry_method: str = "manual",
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

    sale_id = gen_id("s")
    product = None
    if product_id:
        product = db.scalar(select(Product).where(Product.id == product_id, Product.business_id == business_id))
    if product and product.track_inventory:
        # The same hard stock check the multi-item checkout path already made.
        # Both sale paths must refuse to sell what the records say isn't there.
        wanted = quantity or 1
        available = stock_of(db, product.id)
        if wanted > available:
            raise ApiError(
                422, "VALIDATION_ERROR",
                f"Not enough {product.name} in stock — you have {available}.",
            )
        # Store the unit price ON the movement (unit_cost_minor doubles as the
        # movement's unit value: cost for purchases, selling price for sales) —
        # this is the price HISTORY future suggestions read. Only when the
        # total divides cleanly; a bundled price stays on the transaction.
        qty = quantity or 1
        unit_value = amount_minor // qty if amount_minor % qty == 0 else None
        add_movement(db, business_id, product.id, actor, "SALE", -qty, unit_value, sale_id=sale_id)

    cash_tx = None
    if paid > 0:
        cash_tx, _ = create_transaction(
            db, business_id, actor,
            type_="INCOME", amount_minor=paid,
            description=description or (product.name if product else None),
            counterparty_id=customer_id, source="SALE",
            idempotency_key=f"{idempotency_key}:cash" if idempotency_key else None,
            entry_method=entry_method,
        )
    receivable = None
    if credit > 0:
        customer = db.scalar(select(Party).where(Party.id == customer_id, Party.business_id == business_id, Party.kind == "customer"))
        if customer is None:
            raise ApiError(422, "VALIDATION_ERROR", "This sale could not be recorded.")
        receivable = Debt(id=gen_id("r"), business_id=business_id, kind="receivable", counterparty_id=customer.id, amount_minor=credit, settled_minor=0, since=utcnow(), due_date=None, source="SALE", entry_method=entry_method)
        db.add(receivable)

    sale = Sale(
        id=sale_id,
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


def checkout(
    db: Session,
    business_id: str,
    actor: str,
    *,
    items: list[dict],  # [{product_id, quantity}]
    idempotency_key: str | None,
) -> tuple[dict, bool]:
    """Scan-to-sell checkout: MULTI-item cash sale built from the SAME
    primitives as every other sale (create_transaction + add_movement + one
    Sale row) — no second sales-recording system. The SERVER computes the
    total from current prices and validates stock; client totals are display
    assistance only and are never trusted."""
    if idempotency_key:
        existing = db.scalar(select(Sale).where(Sale.business_id == business_id, Sale.idempotency_key == idempotency_key))
        if existing:
            cash = db.get(Transaction, existing.cash_transaction_id) if existing.cash_transaction_id else None
            return {"sale": existing, "transaction": cash, "lines": [], "total_minor": existing.total_minor}, True

    if not items:
        raise ApiError(422, "VALIDATION_ERROR", "Scan at least one product first.")

    # Resolve every line against THIS business's products; compute the total
    # from the server's own current prices; validate stock before anything moves.
    sale_id = gen_id("s")
    lines: list[dict] = []
    seen: set[str] = set()
    for raw in items:
        pid = str(raw.get("product_id") or "")
        qty = raw.get("quantity")
        if pid in seen:
            raise ApiError(422, "VALIDATION_ERROR", "The same product appears twice — combine the quantities.")
        seen.add(pid)
        if not isinstance(qty, int) or qty < 1:
            raise ApiError(422, "VALIDATION_ERROR", "Each scanned product needs a quantity of at least 1.")
        product = db.scalar(select(Product).where(Product.id == pid, Product.business_id == business_id, Product.archived.is_(False)))
        if product is None:
            raise ApiError(422, "VALIDATION_ERROR", "One of the scanned products is not in your records.")
        if product.track_inventory:
            available = stock_of(db, product.id)
            if qty > available:
                raise ApiError(
                    422, "VALIDATION_ERROR",
                    f"Not enough {product.name} in stock — only {available} left.",
                )
        lines.append({"product": product, "quantity": qty, "unit_minor": product.selling_minor, "line_minor": product.selling_minor * qty})

    total = sum(line["line_minor"] for line in lines)
    if total <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "This sale could not be recorded.")

    for line in lines:
        if line["product"].track_inventory:
            add_movement(db, business_id, line["product"].id, actor, "SALE", -line["quantity"], line["unit_minor"], sale_id=sale_id)

    description = ", ".join(f"{line['product'].name} ×{line['quantity']}" for line in lines)[:500]
    cash_tx, _ = create_transaction(
        db, business_id, actor,
        type_="INCOME", amount_minor=total,
        description=description, counterparty_id=None, source="SALE",
        idempotency_key=f"{idempotency_key}:cash" if idempotency_key else None,
        entry_method="scan",
    )
    sale = Sale(
        id=sale_id,
        business_id=business_id,
        total_minor=total,
        occurred_at=utcnow(),
        idempotency_key=idempotency_key,
        cash_transaction_id=cash_tx.id,
        receivable_id=None,
    )
    db.add(sale)
    audit(db, business_id, actor, "sale.checkout", "sale", sale.id, f"{len(lines)} items")
    db.flush()
    return {"sale": sale, "transaction": cash_tx, "lines": lines, "total_minor": total}, False


def settle_debt(db: Session, business_id: str, actor: str, debt_id: str, amount_minor: int) -> tuple[Debt, Transaction]:
    debt = db.scalar(select(Debt).where(Debt.id == debt_id, Debt.business_id == business_id))
    if debt is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    if debt.status != "POSTED":
        raise ApiError(409, "CONFLICT", "This record was already fixed or removed.")
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
        debt_id=debt.id,
    )
    audit(db, business_id, actor, "debt.settle", "debt", debt.id, f"{amount_minor}")
    return debt, tx


def add_manual_debt(db: Session, business_id: str, actor: str, kind: str, counterparty_id: str, amount_minor: int, *, entry_method: str = "manual", idempotency_key: str | None = None) -> Debt:
    if idempotency_key:
        existing = db.scalar(
            select(Debt).where(Debt.business_id == business_id, Debt.idempotency_key == idempotency_key)
        )
        if existing is not None:
            return existing
    party_kind = "customer" if kind == "receivable" else "supplier"
    party = db.scalar(select(Party).where(Party.id == counterparty_id, Party.business_id == business_id, Party.kind == party_kind))
    if party is None or not isinstance(amount_minor, int) or amount_minor <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "This debt could not be recorded.")
    debt = Debt(id=gen_id("r" if kind == "receivable" else "pay"), business_id=business_id, kind=kind, counterparty_id=party.id, amount_minor=amount_minor, settled_minor=0, since=utcnow(), due_date=None, source="MANUAL", entry_method=entry_method if entry_method in ("manual", "text", "voice") else "manual", idempotency_key=idempotency_key)
    db.add(debt)
    audit(db, business_id, actor, "debt.manual", "debt", debt.id)
    db.flush()
    return debt


def reverse_sale(db: Session, business_id: str, actor: str, sale_id: str) -> Sale:
    """Remove a whole sale, not just its cash line.

    A sale can create up to four things: a cash transaction, a receivable, the
    payments made against that receivable, and stock movements. Reversing only
    the cash left the other three standing, so Reports could show 'money in
    Le 0' and '1 sale, Le 50,000' at the same time, stock stayed short, and a
    cancelled credit sale kept inflating booked revenue for ever.

    This reverses all of it, in the immutable way the rest of MI YONE works:
    nothing is deleted, rows are marked REVERSED and stay in the history."""
    sale = db.scalar(select(Sale).where(Sale.id == sale_id, Sale.business_id == business_id))
    if sale is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    if sale.status != "POSTED":
        raise ApiError(409, "CONFLICT", "This record was already fixed or removed.")

    # 1. the cash that came in
    if sale.cash_transaction_id:
        cash = db.get(Transaction, sale.cash_transaction_id)
        if cash is not None and cash.status == "POSTED":
            reverse_transaction(db, business_id, actor, cash.id)

    # 2. the credit extended, and any payments already made against it
    if sale.receivable_id:
        debt = db.scalar(select(Debt).where(Debt.id == sale.receivable_id, Debt.business_id == business_id))
        if debt is not None and debt.status == "POSTED":
            settlements = list(
                db.scalars(
                    select(Transaction).where(
                        Transaction.business_id == business_id,
                        Transaction.debt_id == debt.id,
                        Transaction.status == "POSTED",
                        Transaction.reverses_transaction_id.is_(None),
                    )
                )
            )
            for s_tx in settlements:
                reverse_transaction(db, business_id, actor, s_tx.id)
            debt.status = "REVERSED"

    # 3. the stock that left the shelf
    movements = list(
        db.scalars(
            select(StockMovement).where(
                StockMovement.business_id == business_id,
                StockMovement.sale_id == sale.id,
                StockMovement.status == "POSTED",
            )
        )
    )
    for m in movements:
        m.status = "REVERSED"

    sale.status = "REVERSED"
    audit(db, business_id, actor, "sale.reverse", "sale", sale.id, f"{len(movements)} stock movements")
    db.flush()
    return sale


def reverse_debt(db: Session, business_id: str, actor: str, debt_id: str) -> None:
    """Remove a debt record. A receivable that came from a credit sale has no
    cash transaction to remove, so this is the only door to that sale — it
    reverses the whole sale. A manually added debt reverses on its own, along
    with any payments recorded against it."""
    debt = db.scalar(select(Debt).where(Debt.id == debt_id, Debt.business_id == business_id))
    if debt is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    if debt.status != "POSTED":
        raise ApiError(409, "CONFLICT", "This record was already fixed or removed.")

    if debt.source == "SALE":
        sale = db.scalar(select(Sale).where(Sale.receivable_id == debt.id, Sale.business_id == business_id))
        if sale is not None:
            reverse_sale(db, business_id, actor, sale.id)
            return
    if debt.source == "PURCHASE":
        # A supplier payable belongs to a stock purchase, which also moved
        # stock and may have created an expense. Removing only the debt would
        # leave those standing — the same defect this work exists to fix — so
        # it is refused until purchase reversal is built rather than done
        # half-way.
        raise ApiError(
            422, "VALIDATION_ERROR",
            "This is part of a stock purchase. Record a stock correction instead.",
        )

    for s_tx in db.scalars(
        select(Transaction).where(
            Transaction.business_id == business_id,
            Transaction.debt_id == debt.id,
            Transaction.status == "POSTED",
            Transaction.reverses_transaction_id.is_(None),
        )
    ):
        reverse_transaction(db, business_id, actor, s_tx.id)
    debt.status = "REVERSED"
    audit(db, business_id, actor, "debt.reverse", "debt", debt.id)
    db.flush()
