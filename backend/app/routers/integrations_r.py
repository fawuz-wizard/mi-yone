"""WhatsApp catalog integration endpoints. Connect/import/approve are ADMIN+
(product management); reading the review list follows normal membership."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..core.config import settings
from ..core.db import get_db
from ..core.deps import TenantContext, tenant, tenant_admin
from ..core.envelope import ok
from ..models import CatalogImportItem, Product
from ..serializers import product_json
from ..services import catalog_import

router = APIRouter(prefix="/businesses/{bid}/integrations/whatsapp", tags=["integrations"])


class ApproveInput(BaseModel):
    selling_price_minor: int | None = Field(default=None, ge=1, le=100_000_000_000)
    cost_price_minor: int | None = Field(default=None, ge=0, le=100_000_000_000)
    initial_stock: int | None = Field(default=None, ge=0, le=1_000_000)
    unit: str | None = Field(default=None, max_length=30)


def _item_json(db: Session, item: CatalogImportItem) -> dict:
    duplicate_name = None
    if item.duplicate_of_product_id:
        p = db.get(Product, item.duplicate_of_product_id)
        duplicate_name = p.name if p else None
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": format_money(item.price_minor) if item.price_minor is not None else None,
        "image_url": item.image_url,
        "category": item.category,
        "sku": item.sku,
        "availability": item.availability,
        "status": item.status,
        "duplicate_of_product_id": item.duplicate_of_product_id,
        "duplicate_name": duplicate_name,
        "product_id": item.product_id,
    }


def _import_json(db: Session, imp) -> dict | None:
    if imp is None:
        return None
    items = catalog_import.items_of(db, imp.id)
    return {
        "id": imp.id,
        "status": imp.status,
        "error": imp.error,
        "created_at": imp.created_at.isoformat(),
        "items": [_item_json(db, i) for i in items],
        "needs_review": sum(1 for i in items if i.status == "NEEDS_REVIEW"),
    }


@router.get("")
def status(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    conn = catalog_import.get_connection(db, ctx.business.id)
    imp = catalog_import.latest_import(db, ctx.business.id)
    return ok(
        {
            "mode": settings.wa_mode,  # "test" = labeled sample adapter, no live WhatsApp connection
            "connection": {"id": conn.id, "status": conn.status, "mode": conn.mode} if conn else None,
            "latest_import": _import_json(db, imp),
        }
    )


@router.post("/connect")
def connect(ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    conn = catalog_import.connect(db, ctx.business.id, ctx.user.full_name)
    return ok({"id": conn.id, "status": conn.status, "mode": conn.mode}, status_code=201)


@router.post("/imports")
def run_import(ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    imp = catalog_import.run_import(db, ctx.business.id, ctx.user.full_name)
    return ok(_import_json(db, imp), status_code=201)


@router.post("/items/{item_id}/approve")
def approve(item_id: str, body: ApproveInput, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    item, product = catalog_import.approve_item(
        db, ctx.business.id, ctx.user.full_name, item_id,
        selling_price_minor=body.selling_price_minor,
        cost_price_minor=body.cost_price_minor,
        initial_stock=body.initial_stock,
        unit=body.unit,
    )
    return ok({"item": _item_json(db, item), "product": product_json(db, product)}, status_code=201)


@router.post("/items/{item_id}/skip")
def skip(item_id: str, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    item = catalog_import.skip_item(db, ctx.business.id, ctx.user.full_name, item_id)
    return ok(_item_json(db, item))
