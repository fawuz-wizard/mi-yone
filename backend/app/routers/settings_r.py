"""Settings center endpoints (owner brief) — business details, alert
preferences, WhatsApp disconnect. All on existing models; OWNER/ADMIN only
for mutations via the existing tenant_admin guard."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.deps import TenantContext, tenant, tenant_admin
from ..core.envelope import ApiError, ok
from ..models import CatalogConnection
from ..services.finance import audit
from ..services.watch import alert_prefs_of

router = APIRouter(prefix="/businesses/{bid}", tags=["settings"])


class UpdateBusinessInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.patch("")
def update_business(body: UpdateBusinessInput, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    ctx.business.name = body.name.strip()
    audit(db, ctx.business.id, ctx.user.full_name, "business.update", "business", ctx.business.id)
    return ok({"id": ctx.business.id, "name": ctx.business.name, "currency": ctx.business.currency,
               "initial": ctx.business.name[:1].upper()})


class AlertPrefsInput(BaseModel):
    stock: bool = True
    debts: bool = True
    money: bool = True
    records: bool = True


@router.get("/settings/alerts")
def get_alert_prefs(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    return ok(alert_prefs_of(ctx.business))


@router.patch("/settings/alerts")
def update_alert_prefs(body: AlertPrefsInput, ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    ctx.business.alert_prefs = json.dumps(body.model_dump())
    audit(db, ctx.business.id, ctx.user.full_name, "settings.alerts", "business", ctx.business.id)
    return ok(body.model_dump())


@router.delete("/integrations/whatsapp/connection")
def disconnect_whatsapp(ctx: TenantContext = Depends(tenant_admin), db: Session = Depends(get_db)):
    conn = db.scalar(
        select(CatalogConnection).where(
            CatalogConnection.business_id == ctx.business.id,
            CatalogConnection.provider == "whatsapp",
            CatalogConnection.status == "CONNECTED",
        )
    )
    if conn is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    conn.status = "DISCONNECTED"  # products + import history stay; FK-safe
    audit(db, ctx.business.id, ctx.user.full_name, "catalog.disconnect", "catalog_connection", conn.id)
    return ok({})
