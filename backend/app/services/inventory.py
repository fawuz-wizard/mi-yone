"""Inventory — stock is the sum of an append-only movement ledger (Phase 2 §10)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.envelope import ApiError
from ..models import Category, Debt, Party, Product, StockMovement, utcnow
from ..serializers import stock_of
from .finance import audit, create_transaction

STOCK_CATEGORY = "Stock purchase"


def get_product(db: Session, business_id: str, product_id: str, include_archived: bool = True) -> Product:
    p = db.scalar(select(Product).where(Product.id == product_id, Product.business_id == business_id))
    if p is None or (p.archived and not include_archived):
        raise ApiError(404, "NOT_FOUND", "Product not found.")
    return p


def add_movement(db: Session, business_id: str, product_id: str, actor: str, type_: str, delta: int, unit_cost_minor: int | None = None, note: str | None = None) -> StockMovement:
    m = StockMovement(
        id=gen_id("mv"),
        business_id=business_id,
        product_id=product_id,
        type=type_,
        quantity_delta=delta,
        unit_cost_minor=unit_cost_minor,
        occurred_at=utcnow(),
        recorded_by=actor,
        note=note,
    )
    db.add(m)
    db.flush()
    return m


def add_stock(db: Session, business_id: str, actor: str, product_id: str, *, quantity: int, unit_cost_minor: int, paid: bool, supplier_id: str | None) -> tuple[Product, StockMovement]:
    """One action: PURCHASE movement + expense (paid) or supplier payable (owed)."""
    p = get_product(db, business_id, product_id, include_archived=False)
    if quantity <= 0 or unit_cost_minor < 0:
        raise ApiError(422, "VALIDATION_ERROR", "This stock entry could not be recorded.")
    if not paid and not supplier_id:
        raise ApiError(422, "VALIDATION_ERROR", "This stock entry could not be recorded.")
    if unit_cost_minor > 0:
        p.cost_minor = unit_cost_minor  # latest-cost model (Phase 2 §7.1)
    m = add_movement(db, business_id, product_id, actor, "PURCHASE", quantity, unit_cost_minor or None)
    total = quantity * unit_cost_minor
    if total > 0:
        if paid:
            stock_cat = db.scalar(
                select(Category).where(Category.business_id == business_id, Category.name == STOCK_CATEGORY, Category.kind == "EXPENSE")
            )
            create_transaction(
                db, business_id, actor,
                type_="EXPENSE", amount_minor=total, description=f"{p.name} × {quantity}",
                category_id=stock_cat.id if stock_cat else None, source="MANUAL",
            )
        else:
            supplier = db.scalar(select(Party).where(Party.id == supplier_id, Party.business_id == business_id, Party.kind == "supplier"))
            if supplier is None:
                raise ApiError(422, "VALIDATION_ERROR", "This stock entry could not be recorded.")
            db.add(Debt(id=gen_id("pay"), business_id=business_id, kind="payable", counterparty_id=supplier.id, amount_minor=total, settled_minor=0, since=utcnow(), due_date=None, source="PURCHASE"))
    audit(db, business_id, actor, "stock.add", "product", product_id, f"+{quantity}")
    return p, m


def stock_check(db: Session, business_id: str, actor: str, product_id: str, *, counted: int, reason: str, note: str | None) -> tuple[Product, StockMovement | None]:
    """The owner states reality; the server computes the adjustment."""
    p = get_product(db, business_id, product_id, include_archived=False)
    if counted < 0 or reason not in ("COUNTED", "DAMAGED", "OTHER"):
        raise ApiError(422, "VALIDATION_ERROR", "The count is invalid.")
    delta = counted - stock_of(db, product_id)
    if delta == 0:
        return p, None
    type_ = "DAMAGE" if reason == "DAMAGED" else "ADJUSTMENT"
    m = add_movement(db, business_id, product_id, actor, type_, delta, None, note or reason.lower())
    audit(db, business_id, actor, "stock.check", "product", product_id, f"{delta:+d} ({reason})")
    return p, m
