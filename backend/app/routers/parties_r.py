from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ApiError, ok
from ..models import Debt, Party, Transaction
from ..serializers import debt_json, party_json, tx_json
from ..services.finance import audit, visible_query

router = APIRouter(prefix="/businesses/{bid}", tags=["parties"])


class CreatePartyInput(BaseModel):
    name: str
    phone: str | None = None


class UpdatePartyInput(BaseModel):
    name: str | None = None
    phone: str | None = None
    notes: str | None = None
    archived: bool | None = None


def _kind(path_kind: str) -> str:
    return "customer" if path_kind == "customers" else "supplier"


def _list(db: Session, business_id: str, kind: str) -> list[dict]:
    rows = [
        party_json(db, p)
        for p in db.scalars(select(Party).where(Party.business_id == business_id, Party.kind == kind, Party.archived.is_(False)))
    ]
    rows.sort(key=lambda p: (-p["outstanding"]["amount_minor"], p["name"]))
    return rows


def _create(db: Session, ctx: TenantContext, kind: str, body: CreatePartyInput):
    if not body.name.strip():
        raise ApiError(422, "VALIDATION_ERROR", "A name is needed.")
    p = Party(id=gen_id("c" if kind == "customer" else "s"), business_id=ctx.business.id, kind=kind, name=body.name.strip(), phone=(body.phone or "").strip() or None)
    db.add(p)
    audit(db, ctx.business.id, ctx.user.full_name, f"{kind}.create", "party", p.id)
    db.flush()
    return ok(party_json(db, p), status_code=201)


def _detail(db: Session, ctx: TenantContext, kind: str, party_id: str):
    p = db.scalar(select(Party).where(Party.id == party_id, Party.business_id == ctx.business.id, Party.kind == kind))
    if p is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    open_debts = [
        debt_json(db, d)
        for d in db.scalars(select(Debt).where(Debt.counterparty_id == p.id, Debt.business_id == ctx.business.id))
        if d.amount_minor - d.settled_minor > 0
    ]
    history = list(
        db.scalars(
            visible_query(ctx.business.id)
            .where(Transaction.counterparty_id == p.id)
            .order_by(Transaction.occurred_at.desc())
            .limit(30)
        )
    )
    return ok({"party": party_json(db, p), "open_debts": open_debts, "history": [tx_json(t) for t in history]})


def _update(db: Session, ctx: TenantContext, kind: str, party_id: str, body: UpdatePartyInput):
    p = db.scalar(select(Party).where(Party.id == party_id, Party.business_id == ctx.business.id, Party.kind == kind))
    if p is None:
        raise ApiError(404, "NOT_FOUND", "Not found.")
    if body.name is not None and body.name.strip():
        p.name = body.name.strip()
    if body.phone is not None:
        p.phone = body.phone.strip() or None
    if body.notes is not None:
        p.notes = body.notes.strip() or None
    if body.archived is not None:
        p.archived = body.archived
    audit(db, ctx.business.id, ctx.user.full_name, f"{kind}.update", "party", p.id)
    return ok(party_json(db, p))


for path_kind in ("customers", "suppliers"):
    kind = _kind(path_kind)

    def make_routes(path_kind: str, kind: str):
        @router.get(f"/{path_kind}")
        def list_parties(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
            return ok(_list(db, ctx.business.id, kind))

        @router.post(f"/{path_kind}")
        def create_party(body: CreatePartyInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
            return _create(db, ctx, kind, body)

        @router.get(f"/{path_kind}/{{party_id}}")
        def party_detail(party_id: str, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
            return _detail(db, ctx, kind, party_id)

        @router.patch(f"/{path_kind}/{{party_id}}")
        def update_party(party_id: str, body: UpdatePartyInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
            return _update(db, ctx, kind, party_id, body)

    make_routes(path_kind, kind)
