"""Partner AI endpoints. Read-only over business records: the Partner explains,
it never modifies financial data — its only writes are its own chat messages."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.evidence import build_reply_facts
from ..ai.providers import get_provider
from ..common.ids import gen_id
from ..core import ratelimit
from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ApiError, ok
from ..models import AIMessage
from ..services.finance import audit

router = APIRouter(prefix="/businesses/{bid}/partner", tags=["partner"])


class AskInput(BaseModel):
    text: str = Field(min_length=1, max_length=500)


def _msg_json(m: AIMessage) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text, "intent": m.intent, "created_at": m.created_at.isoformat()}


@router.get("/messages")
def history(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AIMessage).where(AIMessage.business_id == ctx.business.id).order_by(AIMessage.created_at.desc()).limit(50)
        )
    )
    provider = get_provider()
    return ok({"messages": [_msg_json(m) for m in reversed(rows)], "provider": provider.name})


@router.post("/messages")
def ask(body: AskInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    if not ratelimit.allow(f"partner:{ctx.business.id}", 30, 60):
        raise ApiError(429, "RATE_LIMITED", "That's a lot of questions at once — give it a few seconds and ask again.")
    ratelimit.record(f"partner:{ctx.business.id}")

    question = body.text.strip()
    if not question:
        raise ApiError(422, "VALIDATION_ERROR", "Ask me something about your business.")

    intent, facts = build_reply_facts(db, ctx.business, question)
    reply_text = get_provider().compose(question, facts)

    owner_msg = AIMessage(id=gen_id("aim"), business_id=ctx.business.id, role="owner", text=question, intent=None)
    partner_msg = AIMessage(id=gen_id("aim"), business_id=ctx.business.id, role="partner", text=reply_text, intent=intent)
    db.add(owner_msg)
    db.add(partner_msg)
    audit(db, ctx.business.id, ctx.user.full_name, "partner.ask", "ai_message", partner_msg.id, intent)
    db.flush()
    return ok({"owner": _msg_json(owner_msg), "partner": _msg_json(partner_msg)}, status_code=201)
