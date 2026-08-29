"""Deterministic analytics (Phase 2 §13) — every number computed LIVE from the
ledger on request. The AI (later) and the dashboard consume identical results."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..models import Business, Debt, Party, Product, Sale, StockMovement, Transaction, utcnow
from ..serializers import stock_of
from .finance import visible_query

PERF_RANGES = {"7d": ("day", 7), "30d": ("day", 30), "3m": ("week", 13), "6m": ("month", 6), "1y": ("month", 12)}


def _visible(db: Session, business_id: str) -> list[Transaction]:
    return list(db.scalars(visible_query(business_id)))


def _sum_window(rows: list[Transaction], start: datetime, end: datetime) -> tuple[int, int]:
    income = sum(t.amount_minor for t in rows if t.type == "INCOME" and start <= t.occurred_at < end)
    expenses = sum(t.amount_minor for t in rows if t.type == "EXPENSE" and start <= t.occurred_at < end)
    return income, expenses


def _period_start(period: str, now: datetime) -> datetime:
    start = now.astimezone(timezone.utc)
    if period == "today":
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return (start - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def attention_items(db: Session, business_id: str) -> list[dict]:
    items: list[dict] = []
    low = [
        p for p in db.scalars(select(Product).where(Product.business_id == business_id, Product.archived.is_(False), Product.track_inventory.is_(True)))
        if stock_of(db, p.id) <= p.low_stock_threshold
    ]
    if low:
        first_stock = stock_of(db, low[0].id)
        text = f"{low[0].name} is running low ({first_stock} left)" if len(low) == 1 else f"{len(low)} products are running low"
        items.append({"id": "att-low-stock", "kind": "low_stock", "severity": "warning", "text": text, "target": "/stock"})
    debts = list(db.scalars(select(Debt).where(Debt.business_id == business_id)))
    now = utcnow()
    owed_rows = [d for d in debts if d.kind == "receivable" and d.amount_minor - d.settled_minor > 0]
    owed = sum(d.amount_minor - d.settled_minor for d in owed_rows)
    if owed > 0:
        n = len(owed_rows)
        overdue = any(d.due_date is not None and d.due_date < now for d in owed_rows)
        items.append({
            "id": "att-owed", "kind": "owed_to_you", "severity": "danger" if overdue else "warning",
            "text": f"{n} {'customer owes' if n == 1 else 'customers owe'} you {format_money(owed)['display']}",
            "target": "/money?tab=owed",
        })
    owe = sum(d.amount_minor - d.settled_minor for d in debts if d.kind == "payable")
    if owe > 0:
        items.append({"id": "att-owe", "kind": "you_owe", "severity": "warning", "text": f"You owe suppliers {format_money(owe)['display']}", "target": "/money?tab=owe"})
    return items


def dashboard(db: Session, business: Business, period: str) -> dict:
    rows = _visible(db, business.id)
    now = utcnow()
    start = _period_start(period, now)
    end = now + timedelta(seconds=1)
    income, expenses = _sum_window(rows, start, end)
    left = income - expenses

    window = end - start
    prev_income, prev_expenses = _sum_window(rows, start - window, start)
    prev_left = prev_income - prev_expenses
    prev_any = any(start - window <= t.occurred_at < start for t in rows)
    comparison = None
    if prev_any:
        diff = left - prev_left
        unit = "day" if period == "today" else period
        arrow = "↑" if diff >= 0 else "↓"
        word = "more" if diff >= 0 else "less"
        comparison = f"{format_money(abs(diff))['display']} {word} than last {unit} {arrow}"

    trend = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        d_in, d_out = _sum_window(rows, day_start, day_end)
        trend.append((d_in - d_out) / 100)

    month_start = _period_start("month", now)
    by_cat: dict[str, int] = {}
    for t in rows:
        if t.type == "EXPENSE" and t.occurred_at >= month_start:
            by_cat[t.category_name] = by_cat.get(t.category_name, 0) + t.amount_minor
    insight = None
    if by_cat:
        top_name, top_total = max(by_cat.items(), key=lambda kv: kv[1])
        insight = {
            "id": "ins-top-expense",
            "statement": f"{top_name} is your biggest cost this month.",
            "figure": format_money(top_total)["display"],
            "context": "this month so far",
            "action_label": "See these expenses",
            "action_target": "/money?tab=out",
        }

    return {
        "business": {"id": business.id, "name": business.name, "currency": business.currency, "initial": business.name[:1].upper()},
        "health": {
            "period": period,
            "money_in": format_money(income),
            "money_out": format_money(expenses),
            "left_over": format_money(left),
            "comparison": comparison,
            "trend": trend,
            "pending_count": 0,
        },
        "attention": attention_items(db, business.id),
        "insight": insight,
    }


def performance(db: Session, business_id: str, range_: str) -> dict:
    unit, count = PERF_RANGES[range_]
    now = utcnow()
    starts: list[datetime] = []
    for i in range(count - 1, -1, -1):
        d = now
        if unit == "day":
            d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif unit == "week":
            d = (now - timedelta(days=7 * i)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            month = (now.month - 1 - i) % 12 + 1
            year = now.year + (now.month - 1 - i) // 12
            d = now.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)
        starts.append(d)
    ends = [*starts[1:], now + timedelta(seconds=1)]

    rows = _visible(db, business_id)
    buckets = []
    for start, end in zip(starts, ends):
        income, expenses = _sum_window(rows, start, end)
        label = start.strftime("%b") if unit == "month" else f"{start.day} {start.strftime('%b')}"
        buckets.append({"label": label, "income": format_money(income), "expenses": format_money(expenses), "net": format_money(income - expenses)})

    window_start, window_end = starts[0], now + timedelta(seconds=1)
    window = window_end - window_start
    cur_in, cur_out = _sum_window(rows, window_start, window_end)
    prev_in, prev_out = _sum_window(rows, window_start - window, window_start)
    cur_net, prev_net = cur_in - cur_out, prev_in - prev_out

    change_pct = None
    if prev_net != 0:
        pct = (cur_net - prev_net) / abs(prev_net) * 100
        if abs(pct) <= 500:  # near-zero-base guard
            change_pct = f"{'+' if pct >= 0 else '−'}{abs(pct):.1f}"
    direction = "up" if cur_net > prev_net else "down" if cur_net < prev_net else "flat"

    return {
        "range": range_,
        "buckets": buckets,
        "totals": {"income": format_money(cur_in), "expenses": format_money(cur_out), "net": format_money(cur_net)},
        "previous_net": format_money(prev_net),
        "change_pct": change_pct,
        "direction": direction,
    }


TREND_RANGES = {"7d": 7, "30d": 30, "3m": 91, "6m": 182, "1y": 365}
TREND_FLAT_PCT = 5.0
TREND_PCT_GUARD = 500.0


def _trend_metric(key: str, cur: int, prev: int, display: str, good_when_up: bool, has_history: bool) -> dict:
    """One progression/regression tile. direction is None when there is not
    enough history to honestly call it — never labeled improving/declining then."""
    change_pct = None
    direction = None
    if has_history and prev > 0:
        pct = (cur - prev) / prev * 100
        if abs(pct) <= TREND_PCT_GUARD:
            change_pct = f"{'+' if pct >= 0 else '−'}{abs(pct):.1f}"
            direction = "flat" if abs(pct) < TREND_FLAT_PCT else "up" if pct > 0 else "down"
    elif has_history and prev == 0 and cur == 0:
        direction = "flat"
    tone = "neutral"
    if direction == "up":
        tone = "good" if good_when_up else "bad"
    elif direction == "down":
        tone = "bad" if good_when_up else "good"
    return {"key": key, "current": display, "change_pct": change_pct, "direction": direction, "tone": tone}


def trends(db: Session, business_id: str, range_: str) -> dict:
    """Progression/regression per metric: current window vs the equal previous
    window. Deterministic; the AI Partner will later interpret, never replace."""
    days = TREND_RANGES[range_]
    now = utcnow()
    cur_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=2 * days)
    end = now + timedelta(seconds=1)

    rows = _visible(db, business_id)
    # "enough history" = anything at all recorded before the current window
    has_history = any(t.occurred_at < cur_start for t in rows)

    sales_rows = list(db.scalars(select(Sale).where(Sale.business_id == business_id)))
    cur_sales = sum(s.total_minor for s in sales_rows if cur_start <= s.occurred_at < end)
    prev_sales = sum(s.total_minor for s in sales_rows if prev_start <= s.occurred_at < cur_start)

    cur_in, cur_out = _sum_window(rows, cur_start, end)
    prev_in, prev_out = _sum_window(rows, prev_start, cur_start)

    movements = [
        m for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business_id, StockMovement.type == "SALE"))
    ]
    cur_units = sum(abs(m.quantity_delta) for m in movements if cur_start <= m.occurred_at < end)
    prev_units = sum(abs(m.quantity_delta) for m in movements if prev_start <= m.occurred_at < cur_start)

    # Owed to you: outstanding now, and its exact change over the window
    # (new credit extended − settlements received; both are recorded facts).
    debts = list(db.scalars(select(Debt).where(Debt.business_id == business_id, Debt.kind == "receivable")))
    outstanding_now = sum(d.amount_minor - d.settled_minor for d in debts)
    new_credit = sum(d.amount_minor for d in debts if cur_start <= d.since < end)
    collected = sum(
        t.amount_minor for t in rows if t.type == "INCOME" and t.source == "SETTLEMENT" and cur_start <= t.occurred_at < end
    )
    outstanding_start = outstanding_now - new_credit + collected

    metrics = [
        _trend_metric("sales", cur_sales, prev_sales, format_money(cur_sales)["display"], True, has_history),
        _trend_metric("money_out", cur_out, prev_out, format_money(cur_out)["display"], False, has_history),
        _trend_metric("left_over", cur_in - cur_out, prev_in - prev_out, format_money(cur_in - cur_out)["display"], True, has_history),
        _trend_metric("units_sold", cur_units, prev_units, str(cur_units), True, has_history),
        _trend_metric("owed_to_you", outstanding_now, outstanding_start, format_money(outstanding_now)["display"], False, has_history and outstanding_start > 0),
    ]
    return {"range": range_, "metrics": metrics}


def report(db: Session, business_id: str, period: str) -> dict:
    now = utcnow()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now + timedelta(seconds=1)
    elif period == "week":
        start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now + timedelta(seconds=1)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now + timedelta(seconds=1)
    else:  # last_month
        first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month = (first_this.month - 2) % 12 + 1
        year = first_this.year + (first_this.month - 2) // 12
        start = first_this.replace(year=year, month=month)
        end = first_this
    fmt = lambda d: f"{d.day} {d.strftime('%b %Y')}"  # noqa: E731
    label_end = end - timedelta(seconds=1) if period == "last_month" else now
    label = f"{fmt(start)} – {fmt(label_end)}"

    rows = [t for t in _visible(db, business_id) if start <= t.occurred_at < end]
    cash_in = sum(t.amount_minor for t in rows if t.type == "INCOME")
    cash_out = sum(t.amount_minor for t in rows if t.type == "EXPENSE")

    debts = list(db.scalars(select(Debt).where(Debt.business_id == business_id)))
    credit_extended = sum(d.amount_minor for d in debts if d.kind == "receivable" and d.source == "SALE" and start <= d.since < end)
    credit_purchases = sum(d.amount_minor for d in debts if d.kind == "payable" and d.source == "PURCHASE" and start <= d.since < end)
    booked_revenue = sum(t.amount_minor for t in rows if t.type == "INCOME" and t.source != "SETTLEMENT") + credit_extended
    booked_expenses = sum(t.amount_minor for t in rows if t.type == "EXPENSE" and t.source != "SETTLEMENT") + credit_purchases

    sales = [s for s in db.scalars(select(Sale).where(Sale.business_id == business_id)) if start <= s.occurred_at < end]

    top: list[dict] = []
    for p in db.scalars(select(Product).where(Product.business_id == business_id)):
        sold = sum(
            abs(m.quantity_delta)
            for m in db.scalars(select(StockMovement).where(StockMovement.product_id == p.id, StockMovement.type == "SALE"))
            if start <= m.occurred_at < end
        )
        if sold > 0:
            top.append({"name": p.name, "units": sold, "revenue_estimate": format_money(sold * p.selling_minor)})
    top.sort(key=lambda x: -x["revenue_estimate"]["amount_minor"])

    by_cat: dict[str, int] = {}
    for t in rows:
        if t.type == "EXPENSE":
            by_cat[t.category_name] = by_cat.get(t.category_name, 0) + t.amount_minor
    expenses_by_category = sorted(
        ({"name": k, "total": format_money(v)} for k, v in by_cat.items()),
        key=lambda x: -x["total"]["amount_minor"],
    )

    return {
        "period": period,
        "period_label": label,
        "cash": {"money_in": format_money(cash_in), "money_out": format_money(cash_out), "left_over": format_money(cash_in - cash_out)},
        "profit": {
            "booked_revenue": format_money(booked_revenue),
            "booked_expenses": format_money(booked_expenses),
            "profit": format_money(booked_revenue - booked_expenses),
            "credit_extended": format_money(credit_extended),
        },
        "sales": {"count": len(sales), "total": format_money(sum(s.total_minor for s in sales)), "top_products": top[:5]},
        "expenses_by_category": expenses_by_category,
        "_window": (start, end),
    }


def report_csv(db: Session, business: Business, period: str) -> str:
    r = report(db, business.id, period)
    start, end = r.pop("_window")
    esc = lambda s: '"' + s.replace('"', '""') + '"'  # noqa: E731
    lines = [f"MI YONE report,{esc(business.name)},{esc(r['period_label'])}", ""]
    lines.append("Summary,,Amount (Le)")
    lines.append(f"Money in,,{r['cash']['money_in']['amount_minor'] / 100:g}")
    lines.append(f"Money out,,{r['cash']['money_out']['amount_minor'] / 100:g}")
    lines.append(f"Left over (cash),,{r['cash']['left_over']['amount_minor'] / 100:g}")
    lines.append(f"Profit (estimated),,{r['profit']['profit']['amount_minor'] / 100:g}")
    lines.append(f"Credit extended to customers,,{r['profit']['credit_extended']['amount_minor'] / 100:g}")
    lines.append(f"Sales count,,{r['sales']['count']}")
    lines.append("")
    lines.append("Date,Type,Category,Description,Amount (Le),Recorded by")
    rows = sorted((t for t in _visible(db, business.id) if start <= t.occurred_at < end), key=lambda t: t.occurred_at)
    for t in rows:
        signed = t.amount_minor if t.type == "INCOME" else -t.amount_minor
        lines.append(
            ",".join([
                t.occurred_at.strftime("%Y-%m-%d"),
                "Money in" if t.type == "INCOME" else "Money out",
                esc(t.category_name),
                esc(t.description or ""),
                f"{signed / 100:g}",
                esc(t.recorded_by),
            ])
        )
    return "\r\n".join(lines)
