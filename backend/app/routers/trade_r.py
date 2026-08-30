from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ok
from ..models import Debt
from ..serializers import debt_json, tx_json
from ..services import trade

router = APIRouter(prefix="/businesses/{bid}", tags=["trade"])


class CreateSaleInput(BaseModel):
    amount_minor: int = Field(ge=1, le=100_000_000_000)
    product_id: str | None = Field(default=None, max_length=40)
    quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    payment: str = Field(default="PAID", pattern="^(PAID|CREDIT|PARTIAL)$")
    amount_paid_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    customer_id: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=500)
    entry_method: str = Field(default="manual", pattern="^(manual|text|voice)$")


class CheckoutItem(BaseModel):
    product_id: str = Field(min_length=1, max_length=40)
    quantity: int = Field(ge=1, le=9999)


class CheckoutInput(BaseModel):
    items: list[CheckoutItem] = Field(min_length=1, max_length=50)


class CreateDebtInput(BaseModel):
    counterparty_id: str = Field(max_length=40)
    amount_minor: int = Field(ge=1, le=100_000_000_000)
    note: str | None = Field(default=None, max_length=500)
    entry_method: str = Field(default="manual", pattern="^(manual|text|voice)$")


class SettlementInput(BaseModel):
    amount_minor: int = Field(ge=1, le=100_000_000_000)


@router.post("/sales")
def create_sale(
    body: CreateSaleInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ctx: TenantContext = Depends(tenant),
    db: Session = Depends(get_db),
):
    result, replay = trade.create_sale(
        db, ctx.business.id, ctx.user.full_name,
        amount_minor=body.amount_minor, product_id=body.product_id, quantity=body.quantity,
        payment=body.payment, amount_paid_minor=body.amount_paid_minor,
        customer_id=body.customer_id, description=body.description, idempotency_key=idempotency_key,
        entry_method=body.entry_method,
    )
    return ok(
        {
            "transaction": tx_json(result["transaction"]) if result["transaction"] else None,
            "receivable": debt_json(db, result["receivable"]) if result["receivable"] else None,
            "total": format_money(result["sale"].total_minor),
        },
        status_code=200 if replay else 201,
    )


@router.post("/sales/checkout")
def checkout(
    body: CheckoutInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=80),
    ctx: TenantContext = Depends(tenant),
    db: Session = Depends(get_db),
):
    """Scan-to-sell: multi-item cash sale. The server computes the total and
    validates stock — client totals are never trusted (spec §6)."""
    result, replay = trade.checkout(
        db, ctx.business.id, ctx.user.full_name,
        items=[{"product_id": i.product_id, "quantity": i.quantity} for i in body.items],
        idempotency_key=idempotency_key,
    )
    return ok(
        {
            "transaction": tx_json(result["transaction"]) if result["transaction"] else None,
            "total": format_money(result["total_minor"]),
            "lines": [
                {
                    "product_id": line["product"].id,
                    "name": line["product"].name,
                    "quantity": line["quantity"],
                    "unit_price": format_money(line["unit_minor"]),
                    "line_total": format_money(line["line_minor"]),
                }
                for line in result["lines"]
            ],
        },
        status_code=200 if replay else 201,
    )


def _list_debts(db: Session, business_id: str, kind: str) -> list[dict]:
    rows = [
        debt_json(db, d)
        for d in db.scalars(select(Debt).where(Debt.business_id == business_id, Debt.kind == kind))
        if d.amount_minor - d.settled_minor > 0
    ]
    rows.sort(key=lambda d: (not d["overdue"], d["since"]))
    return rows


@router.get("/receivables")
def list_receivables(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    return ok(_list_debts(db, ctx.business.id, "receivable"))


@router.post("/receivables")
def create_receivable(body: CreateDebtInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    debt = trade.add_manual_debt(db, ctx.business.id, ctx.user.full_name, "receivable", body.counterparty_id, body.amount_minor, entry_method=body.entry_method)
    return ok(debt_json(db, debt), status_code=201)


@router.get("/payables")
def list_payables(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    return ok(_list_debts(db, ctx.business.id, "payable"))


@router.post("/payables")
def create_payable(body: CreateDebtInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    debt = trade.add_manual_debt(db, ctx.business.id, ctx.user.full_name, "payable", body.counterparty_id, body.amount_minor, entry_method=body.entry_method)
    return ok(debt_json(db, debt), status_code=201)


@router.post("/debts/{debt_id}/settlements")
def settle(debt_id: str, body: SettlementInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    debt, tx = trade.settle_debt(db, ctx.business.id, ctx.user.full_name, debt_id, body.amount_minor)
    return ok({"debt": debt_json(db, debt), "transaction": tx_json(tx)}, status_code=201)
