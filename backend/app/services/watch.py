"""Business Watch (deterministic monitoring layer).

Every alert is derived LIVE from recorded business data on each request —
nothing is fabricated, nothing is stored, so the same condition can never pile
up duplicate notifications: one condition → one alert, and an alert disappears
the moment the underlying data no longer supports it. Severity: info < warning
< critical. Each alert explains what happened, why it matters, and what the
owner could do. (The future AI Partner will interpret these results; it will
never replace them — Phase 2 §13.)
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.money import format_money
from ..models import Debt, Party, Product, Sale, StockMovement, Transaction, utcnow
from ..serializers import stock_of
from .finance import visible_query

# Deterministic thresholds (documented, testable).
SALES_DOWN_WARN = 15.0  # % fall vs previous period
SALES_DOWN_CRIT = 30.0
PROFIT_DOWN_WARN = 20.0
EXPENSES_UP_WARN = 40.0  # % rise vs previous period
EXPENSES_UP_CRIT = 100.0
UNUSUAL_COST_HIGH = 1.5  # ×recorded cost
UNUSUAL_COST_LOW = 0.5
PCT_GUARD = 500.0  # near-zero-base guard (same rule as performance)
OVERDUE_CRIT_DAYS = 30

WINDOW_DAYS = 7


def _pct_change(cur: int, prev: int) -> float | None:
    """Percent change with the near-zero-base guard; None = insufficient data."""
    if prev <= 0:
        return None
    pct = (cur - prev) / prev * 100
    return pct if abs(pct) <= PCT_GUARD else None


def _alert(id_: str, severity: str, what: str, why: str, action: str, target: str) -> dict:
    return {"id": id_, "severity": severity, "what": what, "why": why, "action": action, "target": target}


def compute_watch(db: Session, business_id: str) -> list[dict]:
    now = utcnow()
    alerts: list[dict] = []

    # ---- stock: sold out (critical) and running low (warning) ---------------
    products = list(
        db.scalars(
            select(Product).where(
                Product.business_id == business_id, Product.archived.is_(False), Product.track_inventory.is_(True)
            )
        )
    )
    levels = [(p, stock_of(db, p.id)) for p in products]
    out = [(p, s) for p, s in levels if s <= 0]
    # only warn about sold-out products that have ever had stock recorded —
    # a brand-new product with no movements yet is not an emergency
    moved = {
        m.product_id
        for m in db.scalars(select(StockMovement).where(StockMovement.business_id == business_id))
    }
    out = [(p, s) for p, s in out if p.id in moved]
    low = [(p, s) for p, s in levels if 0 < s <= p.low_stock_threshold]
    if out:
        p, _s = out[0]
        what = f"{p.name} is sold out." if len(out) == 1 else f"{len(out)} products are sold out."
        alerts.append(
            _alert(
                "watch-out-of-stock", "critical", what,
                "You cannot sell what you do not have — every day out of stock is lost sales.",
                "Restock as soon as you can, or mark the product archived if you no longer sell it.",
                "/stock",
            )
        )
    if low:
        p, s = low[0]
        what = (
            f"{p.name} is running low — only {s} {p.unit}{'s' if s != 1 and not p.unit.endswith('s') else ''} left."
            if len(low) == 1
            else f"{len(low)} products are running low on stock."
        )
        alerts.append(
            _alert(
                "watch-low-stock", "warning", what,
                "Running out mid-week can cost you sales and send customers elsewhere.",
                "Plan a restock before it runs out.",
                "/stock",
            )
        )

    # ---- overdue customer debts --------------------------------------------
    debts = list(db.scalars(select(Debt).where(Debt.business_id == business_id)))
    overdue = [
        d for d in debts
        if d.kind == "receivable" and d.amount_minor - d.settled_minor > 0 and d.due_date is not None and d.due_date < now
    ]
    if overdue:
        total = sum(d.amount_minor - d.settled_minor for d in overdue)
        oldest_days = max((now - d.due_date).days for d in overdue if d.due_date is not None)
        severity = "critical" if oldest_days > OVERDUE_CRIT_DAYS else "warning"
        if len(overdue) == 1:
            party = db.get(Party, overdue[0].counterparty_id)
            who = party.name if party else "A customer"
            what = f"1 customer payment is overdue — {who} owes {format_money(total)['display']}."
        else:
            what = f"{len(overdue)} customer payments are overdue — {format_money(total)['display']} in total."
        alerts.append(
            _alert(
                "watch-overdue", severity, what,
                "Money owed to you is cash you cannot use, and old debts get harder to collect.",
                "Send a reminder, or agree a payment date you can follow up on.",
                "/money?tab=owed",
            )
        )

    # ---- supplier debts past due -------------------------------------------
    payable_overdue = [
        d for d in debts
        if d.kind == "payable" and d.amount_minor - d.settled_minor > 0 and d.due_date is not None and d.due_date < now
    ]
    if payable_overdue:
        total = sum(d.amount_minor - d.settled_minor for d in payable_overdue)
        alerts.append(
            _alert(
                "watch-payable-due", "warning",
                f"You owe suppliers {format_money(total)['display']} past the agreed date.",
                "Paying late can strain the supplier relationships your stock depends on.",
                "Settle what you can, or talk to the supplier about a new date.",
                "/money?tab=owe",
            )
        )

    # ---- money trends: sales down, expenses up, profit squeezed -------------
    window = timedelta(days=WINDOW_DAYS)
    cur_start, prev_start = now - window, now - 2 * window

    sales_rows = list(db.scalars(select(Sale).where(Sale.business_id == business_id)))
    cur_sales = sum(s.total_minor for s in sales_rows if s.occurred_at >= cur_start)
    prev_sales = sum(s.total_minor for s in sales_rows if prev_start <= s.occurred_at < cur_start)
    sales_pct = _pct_change(cur_sales, prev_sales)
    sales_fell = sales_pct is not None and sales_pct <= -SALES_DOWN_WARN
    if sales_fell and sales_pct is not None:
        severity = "critical" if sales_pct <= -SALES_DOWN_CRIT else "warning"
        alerts.append(
            _alert(
                "watch-sales-down", severity,
                f"Sales have fallen {abs(sales_pct):.0f}% compared with your previous week "
                f"({format_money(cur_sales)['display']} vs {format_money(prev_sales)['display']}).",
                "A falling week can mean missing stock, fewer customers, or a price problem.",
                "Check your top products and stock levels, and ask regular customers what changed.",
                "/insights",
            )
        )

    tx_rows: list[Transaction] = list(db.scalars(visible_query(business_id)))
    cur_exp = sum(t.amount_minor for t in tx_rows if t.type == "EXPENSE" and t.occurred_at >= cur_start)
    prev_exp = sum(t.amount_minor for t in tx_rows if t.type == "EXPENSE" and prev_start <= t.occurred_at < cur_start)
    exp_pct = _pct_change(cur_exp, prev_exp)
    if exp_pct is not None and exp_pct >= EXPENSES_UP_WARN:
        severity = "critical" if exp_pct >= EXPENSES_UP_CRIT else "warning"
        # name the biggest driver so the alert is actionable, not just alarming
        by_cat: dict[str, list[int]] = {}
        for t in tx_rows:
            if t.type == "EXPENSE" and t.occurred_at >= prev_start:
                bucket = 0 if t.occurred_at >= cur_start else 1
                by_cat.setdefault(t.category_name, [0, 0])[bucket] += t.amount_minor
        driver = max(by_cat.items(), key=lambda kv: kv[1][0] - kv[1][1], default=None)
        why = "Costs rising faster than sales quietly eat your profit."
        if driver and driver[1][0] > driver[1][1]:
            why = (
                f"{driver[0]} is the biggest driver ({format_money(driver[1][0])['display']} this week vs "
                f"{format_money(driver[1][1])['display']} the week before)."
            )
        alerts.append(
            _alert(
                "watch-expenses-up", severity,
                f"Money out is {exp_pct:.0f}% higher than your previous week "
                f"({format_money(cur_exp)['display']} vs {format_money(prev_exp)['display']}).",
                why,
                "Open the week's spending and check each large record is right and necessary.",
                "/money?tab=out",
            )
        )

    cur_in = sum(t.amount_minor for t in tx_rows if t.type == "INCOME" and t.occurred_at >= cur_start)
    prev_in = sum(t.amount_minor for t in tx_rows if t.type == "INCOME" and prev_start <= t.occurred_at < cur_start)
    cur_left, prev_left = cur_in - cur_exp, prev_in - prev_exp
    if not sales_fell and prev_left > 0:
        left_pct = _pct_change(cur_left, prev_left) if cur_left >= 0 else -100.0
        if left_pct is not None and left_pct <= -PROFIT_DOWN_WARN:
            alerts.append(
                _alert(
                    "watch-profit-down", "warning",
                    f"You kept {abs(left_pct):.0f}% less this week than last "
                    f"({format_money(cur_left)['display']} vs {format_money(prev_left)['display']}).",
                    "Sales held up, but you kept less of them — costs are eating the difference.",
                    "Compare this week's spending with last week's to see where the money went.",
                    "/insights",
                )
            )

    # ---- unusual purchase cost ---------------------------------------------
    recent_purchases = [
        m for m in db.scalars(
            select(StockMovement).where(StockMovement.business_id == business_id, StockMovement.type == "PURCHASE")
        )
        if m.occurred_at >= cur_start and m.unit_cost_minor is not None
    ]
    product_by_id = {p.id: p for p in db.scalars(select(Product).where(Product.business_id == business_id))}
    for m in recent_purchases:
        p = product_by_id.get(m.product_id)
        if not p or p.cost_minor <= 0 or m.unit_cost_minor is None:
            continue
        ratio = m.unit_cost_minor / p.cost_minor
        if ratio >= UNUSUAL_COST_HIGH or ratio <= UNUSUAL_COST_LOW:
            alerts.append(
                _alert(
                    f"watch-unusual-cost-{m.id}", "info",
                    f"You recorded {format_money(m.unit_cost_minor)['display']} per unit for {p.name} — "
                    f"usually about {format_money(p.cost_minor)['display']}.",
                    "It could be a real price change, or a slip when recording.",
                    "Check the record; if the price really changed, update the product's cost.",
                    "/stock",
                )
            )
            break  # one representative alert — never a wall of duplicates

    # ---- incomplete records -------------------------------------------------
    month_start = now - timedelta(days=30)
    vague = [
        t for t in tx_rows
        if t.type == "EXPENSE" and t.occurred_at >= month_start
        and t.category_name == "General expense" and not (t.description or "").strip()
    ]
    if len(vague) >= 3:
        alerts.append(
            _alert(
                "watch-incomplete", "info",
                f"{len(vague)} money-out records this month have no category or note.",
                "Records that say nothing make it impossible to see where money goes.",
                "Open them and add a category or a short note while you still remember.",
                "/money?tab=out",
            )
        )

    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order[a["severity"]])
    return alerts
