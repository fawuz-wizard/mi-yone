"""Partner AI — deterministic question routing + evidence building.

This is the AI CONTEXT layer of the approved architecture:
    DATABASE → SERVICES → CALCULATIONS → METRICS → **AI CONTEXT** → AI → EXPLANATION

Every sentence produced here is grounded in the business's own records via the
EXISTING deterministic services (analytics, watch, ledger queries). The AI
provider that phrases the final reply receives ONLY these sentences — it has no
other source of business facts, so it cannot invent numbers. Where the records
are insufficient, the evidence says so explicitly instead of guessing.

Fact classes, marked in the sentences themselves:
  - verified records ("From your records: …")
  - calculated metrics (comparisons, percentages — with the same near-zero-base
    guard the analytics use)
  - interpretation ("My read: …" — clearly separated)
  - insufficient information ("I don't have enough … yet.")
"""
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..models import Business, Debt, Party, Product, Sale, StockMovement, utcnow
from ..serializers import stock_of
from ..services import analytics
from ..services.finance import visible_query
from ..services.watch import compute_watch
from ..advice import playbook
from ..research import provider as research_provider
from .lang import normalize

INTENTS = (
    "overview", "profit_why", "expenses", "top_products", "product",
    "stock_why", "debts", "attention", "compare", "help",
    # Advisor extension (owner brief): guidance and market research are
    # separate lanes with their own provenance — never blended into records.
    "advice", "decision", "research",
)

# The three kinds of knowledge an answer can contain. Every block carries one,
# and the label travels all the way to the screen.
SOURCE_RECORDS = "records"    # the owner's own verified data
SOURCE_GUIDANCE = "guidance"  # curated human-written business practice
SOURCE_WEB = "web"            # live market research, with sources
SOURCE_NOTE = "note"          # the Partner talking about itself (what it can
                              # and cannot do) — not a knowledge claim, so it
                              # carries no provenance label on screen


@dataclass
class Block:
    """One provenance-labelled part of an answer."""

    source: str
    text: str
    sources: list[dict] = field(default_factory=list)
    researched_at: str | None = None

    def as_json(self) -> dict:
        d = {"source": self.source, "text": self.text}
        if self.sources:
            d["sources"] = self.sources
        if self.researched_at:
            d["researched_at"] = self.researched_at
        return d


@dataclass
class Answer:
    mode: str  # "business" | "advice" | "research"
    intent: str
    product: Product | None
    blocks: list[Block]

    @property
    def records_facts(self) -> list[str]:
        return [b.text for b in self.blocks if b.source == SOURCE_RECORDS]

_money = lambda m: format_money(m)["display"]  # noqa: E731


def _tokens(text: str) -> list[str]:
    return [w for w in "".join(c if c.isalnum() else " " for c in text.lower()).split() if w]


def _product_tokens(p: Product) -> set[str]:
    return {t for t in _tokens(p.name) if len(t) >= 3 and not t[0].isdigit()}


def _match_product(words: set[str], products: list[Product]) -> Product | None:
    """Best-score product match: 'palm oil' must beat 'cooking oil' on the
    shared token. One rule, used by every lane."""
    matched: Product | None = None
    best = 0
    for p in products:
        score = len(_product_tokens(p) & words)
        if score > best:
            best = score
            matched = p
    return matched


def route(question: str, products: list[Product]) -> tuple[str, Product | None]:
    """Deterministic intent router. Product mentions win over generic intents so
    'how much did I make from rice' lands on the product, not the overview.
    Krio is first-class: the question is normalized (ai/lang.py vocabulary)
    before routing, so English, Krio, and mixed phrasing route identically."""
    q = normalize(question)
    words = set(_tokens(q))
    matched = _match_product(words, products)

    if any(w in words for w in ("attention", "focus", "worry", "watch", "problem", "problems")):
        return "attention", None
    # A named product outranks the generic compare intent: "how rice dey do
    # compared to last month" is a question about RICE, answered with its data.
    if matched is not None:
        return "product", matched
    if "compare" in words or "last month" in q or " vs " in q:
        return "compare", None
    if any(w in words for w in ("profit", "keep", "kept")) and any(w in words for w in ("why", "decrease", "decreased", "drop", "dropped", "down", "less", "fell", "fall")):
        return "profit_why", None
    if any(w in words for w in ("expense", "expenses", "spend", "spending", "spent", "cost", "costs")):
        return "expenses", None
    if any(w in words for w in ("stock", "inventory")) :
        return "stock_why", None
    if any(w in words for w in ("selling", "sellers", "bestseller", "best", "top", "move", "moving", "moves")) and ("product" in q or "products" in q or "selling" in words or "move" in words or "moving" in words):
        return "top_products", None
    if any(w in words for w in ("owe", "owes", "owed", "debt", "debts", "credit")):
        return "debts", None
    if any(w in words for w in ("doing", "performance", "performing", "going", "profit", "made", "make", "sales", "business")):
        return "overview", None
    return "help", None


# ---------------------------------------------------------------------------
# Evidence builders — one per intent. Each returns grounded sentences.
# ---------------------------------------------------------------------------

def _windows(db: Session, business_id: str, days: int = 30):
    now = utcnow()
    cur_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=2 * days)
    rows = list(db.scalars(visible_query(business_id)))
    def sums(start, end):
        i = sum(t.amount_minor for t in rows if t.type == "INCOME" and start <= t.occurred_at < end)
        e = sum(t.amount_minor for t in rows if t.type == "EXPENSE" and start <= t.occurred_at < end)
        return i, e
    cur = sums(cur_start, now + timedelta(seconds=1))
    prev = sums(prev_start, cur_start)
    return rows, cur, prev, cur_start, prev_start


def _pct(cur: int, prev: int) -> float | None:
    if prev <= 0:
        return None
    p = (cur - prev) / prev * 100
    return p if abs(p) <= 500 else None


def _overview(db: Session, business: Business, question: str) -> list[str]:
    period = "week" if "week" in question.lower() else "month"
    r = analytics.report(db, business.id, period)
    r.pop("_window", None)
    label = "this week" if period == "week" else "this month"
    if r["cash"]["money_in"]["amount_minor"] == 0 and r["cash"]["money_out"]["amount_minor"] == 0:
        return [f"I don't have any money records for {label} yet, so I can't describe performance. Record a few sales and expenses and I'll have something real to work with."]
    facts = [
        f"From your records {label}: money in {r['cash']['money_in']['display']}, money out {r['cash']['money_out']['display']}, "
        f"left over {r['cash']['left_over']['display']}, across {r['sales']['count']} sales.",
        f"Estimated profit {label} (including credit you extended): {r['profit']['profit']['display']}.",
    ]
    t = {m["key"]: m for m in analytics.trends(db, business.id, "30d")["metrics"]}
    s = t["sales"]
    if s["direction"] is None:
        facts.append("I don't have enough history before this period to say whether sales are trending up or down yet.")
    else:
        word = {"up": "up", "down": "down", "flat": "steady"}[s["direction"]]
        pct = f" ({s['change_pct']}%)" if s["change_pct"] else ""
        facts.append(f"Compared with the 30 days before, sales are {word}{pct}.")
    alerts = compute_watch(db, business.id)
    if alerts:
        facts.append(f"Business Watch has {len(alerts)} thing{'s' if len(alerts) != 1 else ''} for you — the top one: {alerts[0]['what']}")
    else:
        facts.append("Business Watch shows nothing needing attention right now.")
    return facts


def _profit_why(db: Session, business: Business) -> list[str]:
    _rows, (cur_in, cur_out), (prev_in, prev_out), cur_start, prev_start = _windows(db, business.id)
    if prev_in == 0 and prev_out == 0:
        return ["I don't have enough history to explain a profit change — there are no records in the previous 30-day period to compare against."]
    cur_left, prev_left = cur_in - cur_out, prev_in - prev_out
    facts = [
        f"From your records: over the last 30 days you kept {_money(cur_left)}, against {_money(prev_left)} in the 30 days before."
    ]
    in_pct, out_pct = _pct(cur_in, prev_in), _pct(cur_out, prev_out)
    if in_pct is not None:
        facts.append(f"Money in moved {in_pct:+.0f}% ({_money(cur_in)} vs {_money(prev_in)}).")
    if out_pct is not None:
        facts.append(f"Money out moved {out_pct:+.0f}% ({_money(cur_out)} vs {_money(prev_out)}).")
    # biggest expense driver — calculated from the same ledger
    rows = _rows
    by_cat: dict[str, list[int]] = {}
    for t in rows:
        if t.type == "EXPENSE" and t.occurred_at >= prev_start:
            by_cat.setdefault(t.category_name, [0, 0])[0 if t.occurred_at >= cur_start else 1] += t.amount_minor
    driver = max(by_cat.items(), key=lambda kv: kv[1][0] - kv[1][1], default=None)
    if driver and driver[1][0] > driver[1][1]:
        facts.append(f"The biggest cost change is {driver[0]}: {_money(driver[1][0])} this period vs {_money(driver[1][1])} before.")
    if cur_left < prev_left:
        if in_pct is not None and out_pct is not None and out_pct > in_pct:
            facts.append("My read: costs grew faster than sales — that's what squeezed what you kept.")
        elif in_pct is not None and in_pct < 0:
            facts.append("My read: the drop mainly follows lower money in.")
    else:
        facts.append("My read: you actually kept more this period than the one before.")
    return facts


def _expenses(db: Session, business: Business) -> list[str]:
    r = analytics.report(db, business.id, "month")
    r.pop("_window", None)
    cats = r["expenses_by_category"]
    if not cats:
        return ["You have no expenses recorded this month yet, so there's nothing to rank."]
    top = ", ".join(f"{c['name']} ({c['total']['display']})" for c in cats[:3])
    return [
        f"From your records this month: your biggest expenses are {top}.",
        f"Total money out this month: {r['cash']['money_out']['display']}.",
    ]


def _top_products(db: Session, business: Business) -> list[str]:
    r = analytics.report(db, business.id, "month")
    r.pop("_window", None)
    tops = r["sales"]["top_products"]
    if not tops:
        return ["No product sales are recorded this month yet, so I can't rank products. Sales recorded without picking a product don't count toward product rankings."]
    lines = ", ".join(f"{p['name']} ({p['units']} sold, {p['revenue_estimate']['display']})" for p in tops[:3])
    facts = [f"From your records this month, your top products are: {lines}."]
    if any(not p.get("revenue_exact", True) for p in tops[:3]):
        facts.append(
            "Some of those sales were recorded as a bundled total with no per-item price, "
            "so part of the figure uses the current price."
        )
    return facts


def _product(db: Session, business: Business, product: Product) -> list[str]:
    now = utcnow()
    month_start = now - timedelta(days=30)
    moves = [
        m for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business.id, StockMovement.product_id == product.id, StockMovement.status == "POSTED"))
    ]
    sale_moves = [m for m in moves if m.type == "SALE" and m.occurred_at >= month_start]
    sold = sum(abs(m.quantity_delta) for m in sale_moves)
    stock = stock_of(db, product.id)
    facts = []
    if sold == 0:
        facts.append(f"I don't have any recorded sales of {product.name} in the last 30 days.")
    else:
        # The price each sale was actually made at, not today's price.
        revenue, exact = analytics.product_revenue(sale_moves, product.selling_minor)
        unit_word = f"{product.unit}{'s' if sold != 1 and not product.unit.endswith('s') else ''}"
        line = f"From your records: {sold} {unit_word} of {product.name} sold in the last 30 days, bringing in {_money(revenue)}."
        if not exact:
            line += " Some of those were recorded as a bundled total, so part of that figure uses the current price."
        facts.append(line)
    prev_sold = sum(abs(m.quantity_delta) for m in moves if m.type == "SALE" and now - timedelta(days=60) <= m.occurred_at < month_start)
    if prev_sold > 0:
        pct = _pct(sold, prev_sold)
        if pct is not None:
            facts.append(f"That's {pct:+.0f}% versus the 30 days before ({prev_sold} sold then).")
    elif sold > 0:
        facts.append("There's no earlier sales history for this product yet, so I can't call a trend.")
    if product.track_inventory:
        low = stock <= product.low_stock_threshold
        facts.append(f"Current stock: {stock} {product.unit}{'s' if stock != 1 and not product.unit.endswith('s') else ''}{' — that is at or below your low-stock level' if low else ''}.")
    return facts


def _stock_why(db: Session, business: Business) -> list[str]:
    now = utcnow()
    start = now - timedelta(days=30)
    moves = [m for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business.id, StockMovement.status == "POSTED")) if m.occurred_at >= start]
    outs: dict[str, int] = {}
    damaged: dict[str, int] = {}
    for m in moves:
        if m.quantity_delta < 0:
            (outs if m.type == "SALE" else damaged)[m.product_id] = (outs if m.type == "SALE" else damaged).get(m.product_id, 0) + abs(m.quantity_delta)
    if not outs and not damaged:
        return ["Your records show no stock leaving in the last 30 days, so I can't point at a cause. If shelves look emptier than the app says, a stock check will set the record straight."]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.business_id == business.id))}
    facts = []
    if outs:
        top = sorted(outs.items(), key=lambda kv: -kv[1])[:3]
        line = ", ".join(f"{products[pid].name} −{n}" for pid, n in top if pid in products)
        facts.append(f"From your records, stock went down mainly through sales in the last 30 days: {line}.")
    if damaged:
        total = sum(damaged.values())
        facts.append(f"Also, {total} unit{'s' if total != 1 else ''} left through damage or corrections — worth a look if that surprises you.")
    return facts


def _debts(db: Session, business: Business) -> list[str]:
    debts = [d for d in db.scalars(select(Debt).where(Debt.business_id == business.id, Debt.status == "POSTED", Debt.kind == "receivable")) if d.amount_minor - d.settled_minor > 0]
    if not debts:
        return ["No customers owe you money right now, according to your records."]
    total = sum(d.amount_minor - d.settled_minor for d in debts)
    parties = {p.id: p.name for p in db.scalars(select(Party).where(Party.business_id == business.id))}
    top = sorted(debts, key=lambda d: -(d.amount_minor - d.settled_minor))[:3]
    who = ", ".join(f"{parties.get(d.counterparty_id, 'A customer')} ({_money(d.amount_minor - d.settled_minor)})" for d in top)
    now = utcnow()
    overdue = sum(1 for d in debts if d.due_date is not None and d.due_date < now)
    facts = [f"From your records: {len(debts)} customer{'s' if len(debts) != 1 else ''} owe you {_money(total)} in total. The largest: {who}."]
    if overdue:
        facts.append(f"{overdue} of these {'is' if overdue == 1 else 'are'} past the agreed date — those are the ones to chase first.")
    return facts


def _attention(db: Session, business: Business) -> list[str]:
    alerts = compute_watch(db, business.id)
    if not alerts:
        return ["Nothing needs attention right now — Business Watch is clear. A good moment to look at what's selling best and plan stock."]
    facts = [f"Business Watch found {len(alerts)} thing{'s' if len(alerts) != 1 else ''}:"]
    for a in alerts[:4]:
        facts.append(f"• {a['what']} {a['action']}")
    return facts


def _compare(db: Session, business: Business) -> list[str]:
    cur = analytics.report(db, business.id, "month")
    prev = analytics.report(db, business.id, "last_month")
    cur.pop("_window", None)
    prev.pop("_window", None)
    if prev["cash"]["money_in"]["amount_minor"] == 0 and prev["cash"]["money_out"]["amount_minor"] == 0:
        return ["I don't have any records for last month, so there's nothing to compare this month against yet."]
    facts = [
        f"This month so far: money in {cur['cash']['money_in']['display']}, money out {cur['cash']['money_out']['display']}, left over {cur['cash']['left_over']['display']}, {cur['sales']['count']} sales.",
        f"Last month: money in {prev['cash']['money_in']['display']}, money out {prev['cash']['money_out']['display']}, left over {prev['cash']['left_over']['display']}, {prev['sales']['count']} sales.",
    ]
    pct = _pct(cur["cash"]["money_in"]["amount_minor"], prev["cash"]["money_in"]["amount_minor"])
    if pct is not None:
        facts.append(f"Money in is {pct:+.0f}% versus last month — remember this month isn't finished yet, so the gap will close as days are added.")
    return facts


HELP_TEXT = (
    "I can explain what's in your business records. Try asking: \"How is my business doing this month?\", "
    "\"Why did my profit decrease?\", \"What are my biggest expenses?\", \"Which products are selling the most?\", "
    "\"Who owes me money?\", or \"What should I pay attention to?\" I can also give you general business "
    "guidance — \"how can I increase sales?\", \"how do I use WhatsApp to sell?\" — and research the market "
    "when you ask me to. I always tell you which of the three an answer came from, and I never make figures up."
)


FOLLOWUP_PRONOUNS = {"it", "that", "this"}
WHY_WORDS = {"why", "how", "come"}


def resolve_context(
    question: str, intent: str, product: Product | None,
    prev_intent: str | None, prev_product: Product | None,
) -> tuple[str, Product | None]:
    """Conversation context (owner brief §11): a short follow-up inherits the
    subject of the previous answer instead of forcing the owner to repeat the
    whole question. Deterministic: only the STORED previous intent/product is
    used — nothing is guessed."""
    words = set(_tokens(normalize(question)))
    short = len(words) <= 6
    if product is not None or not short:
        return intent, product  # the question stands on its own
    # "Why?" after an answer → explain that subject.
    if words and words <= (WHY_WORDS | FOLLOWUP_PRONOUNS | {"so", "u", "say", "dat"}):
        if prev_product is not None:
            return "product", prev_product
        if prev_intent in ("overview", "compare", "profit_why", "product"):
            return "profit_why", None
    # Pronoun follow-up ("how much I make from it?") → the previous product.
    if (words & FOLLOWUP_PRONOUNS) and prev_product is not None:
        return "product", prev_product
    # Unrecognized short question right after a product answer → that product.
    if intent == "help" and prev_product is not None:
        return "product", prev_product
    return intent, product



# ---------------------------------------------------------------------------
# Advisor lanes (owner brief) — guidance and research routing
# ---------------------------------------------------------------------------

# Explicit "go and look this up" shapes. Checked FIRST, so "research rice
# market" is a research request and not a question about the rice product.
RESEARCH_TRIGGERS = (
    "research", "look up", "search for", "market price", "market prices",
    "going rate", "people buying", "people buy", "customers buying",
    "what is the price of", "current price", "market trend", "market trends",
    "competitor", "competitors", "industry", "trending", "in demand",
    "businesses doing", "shops doing", "businesses are doing", "other shops",
)

# "Should I …" only counts as a decision when a business action follows it.
# "What should I focus on?" stays an attention question, as it always was.
DECISION_VERBS = (
    "buy", "restock", "stock", "increase", "raise", "reduce", "lower", "drop",
    "add", "sell", "expand", "open", "borrow", "hire", "invest", "order",
)

# Topic → the records lane that gives that advice its factual footing.
_SITUATION_OF = {
    "reduce_expenses": "expenses",
    "cash_flow": "expenses",
    "debt_collection": "debts",
    "stock_management": "stock_why",
    "new_products": "top_products",
    "pricing": "top_products",
}


def _has_any(text: str, needles) -> bool:
    return any(n in text for n in needles)


def route_mode(question: str, words: set[str]) -> str | None:
    """Which knowledge lane is being asked for? Returns 'research', 'decision',
    'advice' or None (= the existing business-records routing)."""
    if _has_any(question, RESEARCH_TRIGGERS):
        return "research"
    if "should" in words and (words & set(DECISION_VERBS)) and not (words & {"focus", "attention", "worry"}):
        return "decision"
    if _has_any(question, playbook.ADVICE_TRIGGERS):
        return "advice"
    return None


def _guidance_block(topic: str) -> Block:
    return Block(source=SOURCE_GUIDANCE, text=playbook.render(topic))


def _situation_blocks(db: Session, business: Business, question: str, topic: str, product: Product | None) -> list[Block]:
    """The owner's own numbers behind an advice answer — so guidance lands on
    top of their real situation instead of floating free."""
    if product is not None:
        return [Block(source=SOURCE_RECORDS, text=f) for f in _product(db, business, product)]
    if "compare" in question or "last month" in question:
        facts = _compare(db, business)
    else:
        builder = _SITUATION_OF.get(topic)
        facts = {
            "expenses": lambda: _expenses(db, business),
            "debts": lambda: _debts(db, business),
            "stock_why": lambda: _stock_why(db, business),
            "top_products": lambda: _top_products(db, business),
        }.get(builder, lambda: _overview(db, business, question))()
    return [Block(source=SOURCE_RECORDS, text=f) for f in facts]


def _advice_answer(db: Session, business: Business, question: str, normalized: str, product: Product | None) -> Answer:
    topic = playbook.match_topic(normalized)
    blocks = _situation_blocks(db, business, normalized, topic, product)
    blocks.append(_guidance_block(topic))
    blocks.append(Block(
        source=SOURCE_NOTE,
        text="If you want current market information on this, ask me to research it — I'll show you where it came from.",
    ))
    return Answer(mode="advice", intent="advice", product=product, blocks=blocks)


def _decision_answer(db: Session, business: Business, question: str, normalized: str, product: Product | None) -> Answer:
    """Decision support: the records first, then guidance, then a balanced
    consideration. The Partner never issues an order — the owner decides."""
    topic = playbook.match_topic(normalized, fallback="stock_management")
    blocks = _situation_blocks(db, business, normalized, topic, product)

    # A considered, records-derived weighing — both sides, no instruction.
    if product is not None and product.track_inventory:
        stock = stock_of(db, product.id)
        low = stock <= product.low_stock_threshold
        now = utcnow()
        moves = list(db.scalars(select(StockMovement).where(
            StockMovement.business_id == business.id, StockMovement.product_id == product.id,
            StockMovement.status == "POSTED")))
        sold = sum(abs(m.quantity_delta) for m in moves if m.type == "SALE" and m.occurred_at >= now - timedelta(days=30))
        prev = sum(abs(m.quantity_delta) for m in moves if m.type == "SALE" and now - timedelta(days=60) <= m.occurred_at < now - timedelta(days=30))
        if low and sold > 0:
            weigh = (f"Weighing it up: {product.name} is at or below your low-stock level and it has been "
                     f"selling, so running out is a real risk. Against that, restocking ties up cash — check "
                     f"what you owe suppliers this week before you commit.")
        elif not low and prev > sold:
            weigh = (f"Weighing it up: you still have {stock} {product.unit} and it sold slower than the month "
                     f"before, so there's no urgency in your records. Money spent here is money not available "
                     f"for what is moving.")
        else:
            weigh = ("Weighing it up: your records don't show an urgent shortage. The question is whether the "
                     "cash is better used here or on what is selling faster right now — that part is your call.")
        blocks.append(Block(source=SOURCE_RECORDS, text=weigh))
    else:
        blocks.append(Block(
            source=SOURCE_RECORDS,
            text=("I can only weigh this against what your records actually show. If the figures above don't "
                  "cover the decision, tell me what else you're comparing and I'll look at that too."),
        ))
    blocks.append(_guidance_block(topic))
    return Answer(mode="advice", intent="decision", product=product, blocks=blocks)


def _research_query(question: str, normalized: str, subject: Product | None) -> str:
    """"Research am." only means something if we know what "am" was. A short
    pronoun request inherits the subject of the previous answer — the same
    deterministic conversation context the records lane already uses."""
    words = set(_tokens(normalized))
    bare = words - {"research", "look", "up", "search", "for", "it", "that", "this", "please", "am"}
    if subject is not None and len(bare) <= 1:
        return f"current market information and typical prices for {subject.name} in Sierra Leone"
    return question


def _research_answer(db: Session, business: Business, question: str, normalized: str, subject: Product | None = None) -> Answer:
    """Market research: an external lane with its own provider, its own label,
    and sources. Only the QUESTION and a minimal, non-identifying market hint
    leave MI YONE — never figures, customer names, or the product list."""
    prov = research_provider.get_provider()
    result = prov.search(
        _research_query(question, normalized, subject),
        context="The owner runs a small shop in Sierra Leone.",
    )
    blocks: list[Block] = []

    # A research question that also references the owner's business gets its
    # own records block — dual provenance, never blended (design spec §22).
    if _has_any(normalized, ("my business", "my shop", "compare", "my sales")):
        blocks += [Block(source=SOURCE_RECORDS, text=f) for f in _overview(db, business, normalized)]

    # When research can't run, don't just refuse: if the question has an honest
    # answer inside the owner's OWN records, offer that instead — clearly
    # labelled as their shop, not the market.
    if not result.ok and not blocks and _has_any(normalized, ("buy", "buying", "sell", "selling", "product", "products", "move", "moving")):
        blocks.append(Block(
            source=SOURCE_RECORDS,
            text="I can't tell you what the wider market is buying, but I can tell you what is moving in your own shop:",
        ))
        blocks += [Block(source=SOURCE_RECORDS, text=f) for f in _top_products(db, business)]

    blocks.append(Block(
        source=SOURCE_WEB if result.ok else SOURCE_NOTE,
        text=result.summary,
        sources=[s.as_json() for s in result.sources],
        researched_at=result.researched_at or None,
    ))
    return Answer(mode="research", intent="research", product=None, blocks=blocks)


def build_answer(
    db: Session, business: Business, question: str,
    prev_intent: str | None = None, prev_product_id: str | None = None,
) -> Answer:
    """Route a question to the right knowledge lane and build a provenance-
    labelled answer.

    Three lanes, never blended:
      records   — the owner's verified data (deterministic services)
      guidance  — curated human-written business practice (advice/playbook.json)
      web       — live market research with sources (research/provider.py)

    A single answer may contain blocks from more than one lane — that is the
    combined intelligence the brief asks for — but each block keeps its own
    label all the way to the screen, so the owner always knows which is which.
    """
    products = list(db.scalars(select(Product).where(Product.business_id == business.id, Product.archived.is_(False))))
    normalized = normalize(question)
    words = set(_tokens(normalized))
    lane = route_mode(normalized, words)

    if lane == "research":
        subject = _match_product(words, products) or (
            next((p for p in products if p.id == prev_product_id), None) if prev_product_id else None
        )
        return _research_answer(db, business, question, normalized, subject)
    if lane in ("advice", "decision"):
        matched = _match_product(words, products)
        if matched is None and prev_product_id:
            # A follow-up like "so should I buy more?" keeps the subject.
            matched = next((p for p in products if p.id == prev_product_id), None)
        if lane == "decision":
            return _decision_answer(db, business, question, normalized, matched)
        return _advice_answer(db, business, question, normalized, matched)

    intent, product, facts = build_reply_facts(
        db, business, question, prev_intent=prev_intent, prev_product_id=prev_product_id, _products=products
    )
    return Answer(mode="business", intent=intent, product=product,
                  blocks=[Block(source=SOURCE_RECORDS, text=f) for f in facts])


def build_reply_facts(
    db: Session, business: Business, question: str,
    prev_intent: str | None = None, prev_product_id: str | None = None,
    _products: list[Product] | None = None,
) -> tuple[str, Product | None, list[str]]:
    """Route the question (with conversation context) and return
    (intent, matched product, grounded fact sentences) from the RECORDS lane."""
    products = _products if _products is not None else list(
        db.scalars(select(Product).where(Product.business_id == business.id, Product.archived.is_(False)))
    )
    intent, product = route(question, products)
    prev_product = next((p for p in products if p.id == prev_product_id), None) if prev_product_id else None
    intent, product = resolve_context(question, intent, product, prev_intent, prev_product)
    if intent == "overview":
        return intent, None, _overview(db, business, question)
    if intent == "profit_why":
        return intent, None, _profit_why(db, business)
    if intent == "expenses":
        return intent, None, _expenses(db, business)
    if intent == "top_products":
        return intent, None, _top_products(db, business)
    if intent == "product" and product is not None:
        return intent, product, _product(db, business, product)
    if intent == "stock_why":
        return intent, None, _stock_why(db, business)
    if intent == "debts":
        return intent, None, _debts(db, business)
    if intent == "attention":
        return intent, None, _attention(db, business)
    if intent == "compare":
        return intent, None, _compare(db, business)
    return "help", None, [HELP_TEXT]


def overview_line(db: Session, business: Business) -> dict | None:
    """Partner one-line Overview summary (AI CONTEXT layer, Phase M17).

    Says what changed over the last 30 days and names the largest MEASURED
    contributor — contribution, never causation. Built from the same
    deterministic trends the tiles show, so it cannot disagree with them.
    Returns None when history is insufficient; the caller keeps its
    deterministic top-expense insight instead. No provider call here: this is
    grounded composition, and the chat Partner remains the place for phrased
    conversation."""
    t = analytics.trends(db, business.id, "30d")
    metrics = {m["key"]: m for m in t["metrics"]}
    lo = metrics["left_over"]
    if lo["direction"] is None:
        return None
    word = {"up": "improved", "down": "declined", "flat": "held steady"}[lo["direction"]]
    pct = f" ({lo['change_pct']}%)" if lo["change_pct"] else ""
    contributors = t.get("contributors") or []
    return {
        "id": "ins-partner-overview",
        "statement": f"What you kept {word}{pct} over the last 30 days.",
        "figure": lo["current"],
        "context": contributors[0]["text"] if contributors else "Compared with the 30 days before.",
        "action_label": "Ask the Partner",
        "action_target": "/partner",
    }
