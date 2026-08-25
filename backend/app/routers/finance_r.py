from datetime import date

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ApiError, ok
from ..models import Category, Transaction
from ..serializers import tx_json
from ..services import finance

router = APIRouter(prefix="/businesses/{bid}", tags=["finance"])


@router.get("/categories")
def list_categories(kind: str | None = None, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    q = select(Category).where(Category.business_id == ctx.business.id)
    if kind in ("INCOME", "EXPENSE"):
        q = q.where(Category.kind == kind)
    return ok([{"id": c.id, "name": c.name, "kind": c.kind} for c in db.scalars(q)])


class CreateTransactionInput(BaseModel):
    type: str
    amount_minor: int
    category_id: str | None = None
    description: str | None = None
    occurred_at: str | None = None
    source: str = "MANUAL"


class FixInput(BaseModel):
    amount_minor: int | None = None
    category_id: str | None = None
    description: str | None = None
    occurred_at: str | None = None
    reason: str = "correction"


@router.get("/transactions")
def list_transactions(
    type: str | None = None,
    category: str | None = None,
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    ctx: TenantContext = Depends(tenant),
    db: Session = Depends(get_db),
):
    q = finance.visible_query(ctx.business.id)
    if type in ("INCOME", "EXPENSE"):
        q = q.where(Transaction.type == type)
    if category:
        q = q.where(Transaction.category_name == category)
    rows = list(db.scalars(q.order_by(Transaction.occurred_at.desc()).limit(500)))
    if from_:
        rows = [t for t in rows if t.occurred_at.strftime("%Y-%m-%d") >= from_]
    if to:
        rows = [t for t in rows if t.occurred_at.strftime("%Y-%m-%d") <= to]
    return ok([tx_json(t) for t in rows[:100]])


@router.post("/transactions")
def create_transaction(
    body: CreateTransactionInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ctx: TenantContext = Depends(tenant),
    db: Session = Depends(get_db),
):
    if body.type not in ("INCOME", "EXPENSE"):
        raise ApiError(422, "VALIDATION_ERROR", "The record is invalid.")
    t, replay = finance.create_transaction(
        db, ctx.business.id, ctx.user.full_name,
        type_=body.type, amount_minor=body.amount_minor, category_id=body.category_id,
        description=body.description, occurred_at=body.occurred_at,
        source=body.source if body.source in ("MANUAL", "SALE") else "MANUAL",
        idempotency_key=idempotency_key,
    )
    return ok(tx_json(t), status_code=200 if replay else 201)


@router.get("/transactions/{tx_id}")
def get_transaction(tx_id: str, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    t = db.scalar(select(Transaction).where(Transaction.id == tx_id, Transaction.business_id == ctx.business.id))
    if t is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    return ok(tx_json(t))


@router.post("/transactions/{tx_id}/fix")
def fix_transaction(tx_id: str, body: FixInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    corrected = finance.fix_transaction(
        db, ctx.business.id, ctx.user.full_name, tx_id,
        amount_minor=body.amount_minor, category_id=body.category_id,
        description=body.description, occurred_at=body.occurred_at,
    )
    return ok(tx_json(corrected))


@router.post("/transactions/{tx_id}/reverse")
def reverse_transaction(tx_id: str, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    finance.reverse_transaction(db, ctx.business.id, ctx.user.full_name, tx_id)
    return ok({"reversed": True})
