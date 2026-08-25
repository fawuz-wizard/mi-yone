"""Contract serializers — the exact JSON shapes the frontend consumes."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .common.money import format_money
from .models import Debt, Party, Product, StockMovement, Transaction, utcnow


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def tx_json(t: Transaction) -> dict:
    fixed = None
    if t.fixed_by is not None and t.fixed_was_minor is not None and t.fixed_now_minor is not None:
        fixed = {"by": t.fixed_by, "was": format_money(t.fixed_was_minor), "now": format_money(t.fixed_now_minor)}
    return {
        "id": t.id,
        "business_id": t.business_id,
        "type": t.type,
        "status": t.status,
        "amount": format_money(t.amount_minor),
        "category_name": t.category_name,
        "description": t.description,
        "occurred_at": iso(t.occurred_at),
        "created_at": iso(t.created_at),
        "recorded_by": t.recorded_by,
        "source": t.source,
        "counterparty_id": t.counterparty_id,
        "reverses_transaction_id": t.reverses_transaction_id,
        "fixed": fixed,
    }


def stock_of(db: Session, product_id: str) -> int:
    return int(
        db.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(StockMovement.product_id == product_id))
        or 0
    )


def product_json(db: Session, p: Product) -> dict:
    stock = stock_of(db, p.id) if p.track_inventory else 0
    return {
        "id": p.id,
        "name": p.name,
        "unit": p.unit,
        "selling_price": format_money(p.selling_minor),
        "cost_price": format_money(p.cost_minor),
        "stock": stock,
        "low_stock_threshold": p.low_stock_threshold,
        "low_stock": bool(p.track_inventory and stock <= p.low_stock_threshold),
        "stock_value": format_money(max(0, stock) * p.cost_minor),
        "track_inventory": p.track_inventory,
        "archived": p.archived,
    }


def movement_json(m: StockMovement) -> dict:
    return {
        "id": m.id,
        "product_id": m.product_id,
        "type": m.type,
        "quantity_delta": m.quantity_delta,
        "unit_cost": None if m.unit_cost_minor is None else format_money(m.unit_cost_minor),
        "occurred_at": iso(m.occurred_at),
        "recorded_by": m.recorded_by,
        "note": m.note,
    }


def debt_json(db: Session, d: Debt) -> dict:
    party = db.get(Party, d.counterparty_id)
    outstanding = d.amount_minor - d.settled_minor
    overdue = d.due_date is not None and d.due_date < utcnow() and outstanding > 0
    return {
        "id": d.id,
        "counterparty_id": d.counterparty_id,
        "counterparty_name": party.name if party else "—",
        "amount": format_money(d.amount_minor),
        "outstanding": format_money(outstanding),
        "since": iso(d.since),
        "due_date": None if d.due_date is None else iso(d.due_date),
        "overdue": overdue,
        "status": "SETTLED" if outstanding == 0 else ("PARTIAL" if d.settled_minor > 0 else "OPEN"),
    }


def outstanding_for(db: Session, party_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(Debt.amount_minor - Debt.settled_minor), 0)).where(Debt.counterparty_id == party_id)
        )
        or 0
    )


def party_json(db: Session, p: Party) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "phone": p.phone,
        "notes": p.notes,
        "archived": p.archived,
        "outstanding": format_money(outstanding_for(db, p.id)),
    }
