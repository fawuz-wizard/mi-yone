from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.db import get_db
from ..core.deps import TenantContext, tenant, tenant_admin
from ..core.envelope import ApiError, ok
from ..models import Product, StockMovement
from ..serializers import movement_json, product_json
from ..services import inventory
from ..services.finance import audit

router = APIRouter(prefix="/businesses/{bid}/products", tags=["stock"])


class CreateProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str | None = Field(default=None, max_length=24)
    selling_price_minor: int = Field(ge=1, le=100_000_000_000)
    cost_price_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=1_000_000)
    initial_stock: int | None = Field(default=None, ge=0, le=1_000_000)


class UpdateProductInput(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    unit: str | None = Field(default=None, max_length=24)
    selling_price_minor: int | None = Field(default=None, ge=1, le=100_000_000_000)
    cost_price_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=1_000_000)
    archived: bool | None = None


class AddStockInput(BaseModel):
    quantity: int = Field(ge=1, le=1_000_000)
    unit_cost_minor: int = Field(ge=0, le=100_000_000_000)
    paid: bool
    supplier_id: str | None = Field(default=None, max_length=40)


class StockCheckInput(BaseModel):
    counted: int = Field(ge=0, le=1_000_000)
    reason: str = Field(pattern="^(COUNTED|DAMAGED|OTHER)$")
    note: str | None = Field(default=None, max_length=200)


@router.get("")
def list_products(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    rows = [product_json(db, p) for p in db.scalars(select(Product).where(Product.business_id == ctx.business.id, Product.archived.is_(False)))]
    rows.sort(key=lambda p: (not p["low_stock"], p["name"]))
    return ok(rows)


@router.post("")
def create_product(body: CreateProductInput, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    if not body.name.strip() or body.selling_price_minor <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "A name and selling price are needed.")
    p = Product(
        id=gen_id("p"),
        business_id=ctx.business.id,
        name=body.name.strip(),
        unit=(body.unit or "piece").strip() or "piece",
        selling_minor=body.selling_price_minor,
        cost_minor=body.cost_price_minor or 0,
        low_stock_threshold=body.low_stock_threshold if body.low_stock_threshold is not None else 5,
    )
    db.add(p)
    if body.initial_stock and body.initial_stock > 0:
        inventory.add_movement(db, ctx.business.id, p.id, ctx.user.full_name, "PURCHASE", body.initial_stock, p.cost_minor or None, "Opening stock")
    audit(db, ctx.business.id, ctx.user.full_name, "product.create", "product", p.id)
    db.flush()
    return ok(product_json(db, p), status_code=201)


@router.get("/{product_id}")
def product_detail(product_id: str, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p = inventory.get_product(db, ctx.business.id, product_id)
    movements = list(
        db.scalars(
            select(StockMovement)
            .where(StockMovement.product_id == p.id)
            .order_by(StockMovement.occurred_at.desc())
            .limit(30)
        )
    )
    return ok({"product": product_json(db, p), "movements": [movement_json(m) for m in movements]})


@router.patch("/{product_id}")
def update_product(product_id: str, body: UpdateProductInput, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    p = inventory.get_product(db, ctx.business.id, product_id)
    if body.name is not None and body.name.strip():
        p.name = body.name.strip()
    if body.unit is not None and body.unit.strip():
        p.unit = body.unit.strip()
    if body.selling_price_minor is not None:
        p.selling_minor = body.selling_price_minor
    if body.cost_price_minor is not None:
        p.cost_minor = body.cost_price_minor
    if body.low_stock_threshold is not None:
        p.low_stock_threshold = max(0, body.low_stock_threshold)
    if body.archived is not None:
        p.archived = body.archived
    audit(db, ctx.business.id, ctx.user.full_name, "product.update", "product", p.id)
    return ok(product_json(db, p))


@router.post("/{product_id}/stock")
def add_stock(product_id: str, body: AddStockInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p, m = inventory.add_stock(
        db, ctx.business.id, ctx.user.full_name, product_id,
        quantity=body.quantity, unit_cost_minor=body.unit_cost_minor, paid=body.paid, supplier_id=body.supplier_id,
    )
    return ok({"product": product_json(db, p), "movement": movement_json(m)}, status_code=201)


@router.post("/{product_id}/stock-check")
def stock_check(product_id: str, body: StockCheckInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    p, m = inventory.stock_check(
        db, ctx.business.id, ctx.user.full_name, product_id,
        counted=body.counted, reason=body.reason, note=body.note,
    )
    return ok({"product": product_json(db, p), "movement": movement_json(m) if m else None}, status_code=201)
