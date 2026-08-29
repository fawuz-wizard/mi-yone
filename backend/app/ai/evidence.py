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
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..models import Business, Debt, Party, Product, Sale, StockMovement, utcnow
from ..serializers import stock_of
from ..services import analytics
from ..services.finance import visible_query
from ..services.watch import compute_watch

INTENTS = (
    "overview", "profit_why", "expenses", "top_products", "product",
    "stock_why", "debts", "attention", "compare", "help",
)

_money = lambda m: format_money(m)["display"]  # noqa: E731


def _tokens(text: str) -> list[str]:
    return [w for w in "".join(c if c.isalnum() else " " for c in text.lower()).split() if w]


def _product_tokens(p: Product) -> set[str]:
    return {t for t in _tokens(p.name) if len(t) >= 3 and not t[0].isdigit()}


def route(question: str, products: list[Product]) -> tuple[str, Product | None]:
    """Deterministic intent router. Product mentions win over generic intents so
    'how much did I make from rice' lands on the product, not the overview."""
    q = question.lower()
    words = set(_tokens(question))

    # Best-score match: "palm oil" must beat "cooking oil" on the shared token.
    matched: Product | None = None
    best = 0
    for p in products:
        score = len(_product_tokens(p) & words)
        if score > best:
            best = score
            matched = p

    if any(w in words for w in ("attention", "focus", "worry", "watch", "problem", "problems")):
        return "attention", None
    if "compare" in words or "last month" in q or " vs " in q:
        return "compare", None
    if matched is not None:
        return "product", matched
    if any(w in words for w in ("profit", "keep", "kept")) and any(w in words for w in ("why", "decrease", "decreased", "drop", "dropped", "down", "less", "fell", "fall")):
        return "profit_why", None
    if any(w in words for w in ("expense", "expenses", "spend", "spending", "spent", "cost", "costs")):
        return "expenses", None
    if any(w in words for w in ("stock", "inventory")) :
        return "stock_why", None
    if any(w in words for w in ("selling", "sellers", "bestseller", "best", "top")) and ("product" in q or "products" in q or "selling" in words):
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
    lines = ", ".join(f"{p['name']} ({p['units']} sold, about {p['revenue_estimate']['display']})" for p in tops[:3])
    return [
        f"From your records this month, your top products are: {lines}.",
        "Product revenue is estimated from units sold at each product's current price — individual sale prices can differ.",
    ]


def _product(db: Session, business: Business, product: Product) -> list[str]:
    now = utcnow()
    month_start = now - timedelta(days=30)
    moves = [
        m for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business.id, StockMovement.product_id == product.id))
    ]
    sold = sum(abs(m.quantity_delta) for m in moves if m.type == "SALE" and m.occurred_at >= month_start)
    stock = stock_of(db, product.id)
    facts = []
    if sold == 0:
        facts.append(f"I don't have any recorded sales of {product.name} in the last 30 days.")
    else:
        est = sold * product.selling_minor
        facts.append(f"From your records: {sold} {product.unit}{'s' if sold != 1 and not product.unit.endswith('s') else ''} of {product.name} sold in the last 30 days — roughly {_money(est)} at your current price of {_money(product.selling_minor)} (an estimate; individual sale prices can differ).")
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
    moves = [m for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business.id)) if m.occurred_at >= start]
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
    debts = [d for d in db.scalars(select(Debt).where(Debt.business_id == business.id, Debt.kind == "receivable")) if d.amount_minor - d.settled_minor > 0]
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
    "\"Who owes me money?\", or \"What should I pay attention to?\" I only use your recorded data — I never make figures up."
)


def build_reply_facts(db: Session, business: Business, question: str) -> tuple[str, list[str]]:
    """Route the question and return (intent, grounded fact sentences)."""
    products = list(db.scalars(select(Product).where(Product.business_id == business.id, Product.archived.is_(False))))
    intent, product = route(question, products)
    if intent == "overview":
        return intent, _overview(db, business, question)
    if intent == "profit_why":
        return intent, _profit_why(db, business)
    if intent == "expenses":
        return intent, _expenses(db, business)
    if intent == "top_products":
        return intent, _top_products(db, business)
    if intent == "product" and product is not None:
        return intent, _product(db, business, product)
    if intent == "stock_why":
        return intent, _stock_why(db, business)
    if intent == "debts":
        return intent, _debts(db, business)
    if intent == "attention":
        return intent, _attention(db, business)
    if intent == "compare":
        return intent, _compare(db, business)
    return "help", [HELP_TEXT]
