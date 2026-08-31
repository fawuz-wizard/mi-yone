"""Partner AI endpoints. Read-only over business records: the Partner explains,
it never modifies financial data — its only writes are its own chat messages.

Three knowledge lanes reach the owner through this one endpoint (owner brief):
records, general guidance, and market research. Each answer block keeps its own
provenance label from the evidence layer all the way to the screen, so nothing
is ever presented as a business fact unless it came from the business.
"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.evidence import SOURCE_RECORDS, build_answer
from ..ai.providers import get_provider
from ..common.ids import gen_id
from ..core import ratelimit
from ..core.db import get_db
from ..core.deps import TenantContext, tenant
from ..core.envelope import ApiError, ok
from ..models import AIMessage
from ..research import provider as research_provider
from ..services.finance import audit

router = APIRouter(prefix="/businesses/{bid}/partner", tags=["partner"])


class AskInput(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    # The owner can ASK for a lane explicitly (the "your business | the web"
    # toggle). "auto" lets the deterministic router decide from the question.
    mode: str = Field(default="auto", pattern="^(auto|business|research)$")


def _msg_json(m: AIMessage) -> dict:
    # Stored intent may carry conversation context ("product:<id>"); the API
    # contract exposes the clean intent name only.
    # Stored as "<intent>" or "<intent>:<product_id>" (conversation context).
    intent = m.intent.split(":", 1)[0] if m.intent else m.intent
    out = {
        "id": m.id,
        "role": m.role,
        "text": m.text,
        "intent": intent,
        "mode": m.mode or "business",
        "created_at": m.created_at.isoformat(),
    }
    if m.blocks_json:
        try:
            out["blocks"] = json.loads(m.blocks_json)
        except ValueError:  # a corrupt row must never break the whole history
            pass
    return out


@router.get("/messages")
def history(ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AIMessage).where(AIMessage.business_id == ctx.business.id).order_by(AIMessage.created_at.desc()).limit(50)
        )
    )
    return ok({
        "messages": [_msg_json(m) for m in reversed(rows)],
        "provider": get_provider().name,
        # The UI tells the owner the truth about what research can do right now
        # instead of offering a mode that will only apologise.
        "research_available": research_provider.get_provider().available,
    })


@router.post("/messages")
def ask(body: AskInput, ctx: TenantContext = Depends(tenant), db: Session = Depends(get_db)):
    if not ratelimit.allow(f"partner:{ctx.business.id}", 30, 60):
        raise ApiError(429, "RATE_LIMITED", "That's a lot of questions at once — give it a few seconds and ask again.")
    ratelimit.record(f"partner:{ctx.business.id}")

    question = body.text.strip()
    if not question:
        raise ApiError(422, "VALIDATION_ERROR", "Ask me something about your business.")

    # Conversation context (§11): the previous answer's stored intent (and
    # product, encoded as "product:<id>") lets short follow-ups like "why?"
    # or "research am" inherit their subject deterministically.
    prev = db.scalar(
        select(AIMessage)
        .where(AIMessage.business_id == ctx.business.id, AIMessage.role == "partner")
        .order_by(AIMessage.created_at.desc())
        .limit(1)
    )
    prev_intent, prev_product_id = None, None
    if prev is not None and prev.intent:
        prev_intent, _, prev_product_id = prev.intent.partition(":")
        prev_product_id = prev_product_id or None

    # An explicit "the web" request is honoured as a research question even if
    # the wording alone wouldn't have triggered it.
    asked = question if body.mode != "research" else f"research {question}"
    answer = build_answer(db, ctx.business, asked, prev_intent=prev_intent, prev_product_id=prev_product_id)

    # Only the RECORDS lane is phrased by the AI provider — and it receives
    # nothing but those grounded sentences. Guidance is rendered verbatim from
    # the human-written playbook, and research summaries come back already
    # bound to their sources. Neither is rewritten by a model here.
    rendered: list[dict] = []
    for block in answer.blocks:
        rendered.append(block.as_json())
    records_text = [b["text"] for b in rendered if b["source"] == SOURCE_RECORDS]
    if records_text and answer.mode == "business":
        phrased = get_provider().compose(question, records_text)
        rendered = [{"source": SOURCE_RECORDS, "text": phrased}]
    reply_text = "\n\n".join(b["text"] for b in rendered)

    # The subject travels with the intent so a follow-up ("why?", "research am")
    # inherits it — the intent name itself is what the API exposes.
    stored_intent = f"{answer.intent}:{answer.product.id}" if answer.product is not None else answer.intent
    owner_msg = AIMessage(
        id=gen_id("aim"), business_id=ctx.business.id, role="owner", text=question, intent=None, mode=answer.mode
    )
    partner_msg = AIMessage(
        id=gen_id("aim"), business_id=ctx.business.id, role="partner", text=reply_text,
        intent=stored_intent, mode=answer.mode, blocks_json=json.dumps(rendered),
    )
    db.add(owner_msg)
    db.add(partner_msg)
    audit(db, ctx.business.id, ctx.user.full_name, "partner.ask", "ai_message", partner_msg.id, answer.intent)
    db.flush()
    return ok({"owner": _msg_json(owner_msg), "partner": _msg_json(partner_msg)}, status_code=201)
