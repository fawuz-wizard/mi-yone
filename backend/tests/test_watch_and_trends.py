"""Business Watch + progression/regression trends (deterministic layers).
Covers: empty/insufficient data, rising and falling trends, low/out-of-stock,
overdue debts, expense spikes, unusual cost, incomplete records, and that
alerts never duplicate (state-derived, not accumulated)."""
from datetime import timedelta

from app.core.db import SessionLocal
from app.models import Debt, Party, Sale, utcnow

BASE = "/api/v1/businesses/b-1"


def _iso_days_ago(days: int) -> str:
    return (utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")


def _tx(client, type_, amount, days_ago, category_id=None, description=None):
    r = client.post(
        f"{BASE}/transactions",
        json={
            "type": type_, "amount_minor": amount, "source": "MANUAL",
            "occurred_at": _iso_days_ago(days_ago),
            "category_id": category_id, "description": description,
        },
    )
    assert r.status_code in (200, 201)


def _sale_row(total_minor: int, days_ago: int) -> None:
    with SessionLocal() as db:
        db.add(Sale(id=f"s-test-{total_minor}-{days_ago}", business_id="b-1", total_minor=total_minor, occurred_at=utcnow() - timedelta(days=days_ago)))
        db.commit()


def _watch(client) -> list[dict]:
    r = client.get(f"{BASE}/watch")
    assert r.status_code == 200
    return r.json()["data"]["alerts"]


def _trends(client, range_="7d") -> dict:
    r = client.get(f"{BASE}/analytics/trends?range={range_}")
    assert r.status_code == 200
    return {m["key"]: m for m in r.json()["data"]["metrics"]}


# ---------------------------------------------------------------------------
# Empty / insufficient data: no fabricated alerts, no fabricated directions
# ---------------------------------------------------------------------------

def test_empty_business_no_alerts_no_directions(client):
    assert _watch(client) == []
    for m in _trends(client).values():
        assert m["direction"] is None
        assert m["change_pct"] is None


def test_recent_data_without_history_gets_no_direction(client):
    _tx(client, "INCOME", 500_000, 2)  # inside the window, nothing before it
    m = _trends(client)
    assert m["left_over"]["direction"] is None  # never labeled without a comparison base


# ---------------------------------------------------------------------------
# Trends: rising, falling, stable
# ---------------------------------------------------------------------------

def test_rising_and_falling_directions(client):
    # previous week: in 100,000 / out 40,000 · current week: in 150,000 / out 20,000
    _tx(client, "INCOME", 100_000_00, 10)
    _tx(client, "EXPENSE", 40_000_00, 9)
    _tx(client, "INCOME", 150_000_00, 2)
    _tx(client, "EXPENSE", 20_000_00, 1)
    m = _trends(client)
    assert m["left_over"]["direction"] == "up" and m["left_over"]["tone"] == "good"
    assert m["money_out"]["direction"] == "down" and m["money_out"]["tone"] == "good"  # spending down = good
    assert m["money_out"]["change_pct"] == "−50.0"


def test_stable_direction_within_flat_band(client):
    _tx(client, "INCOME", 100_000_00, 10)
    _tx(client, "INCOME", 102_000_00, 2)  # +2% < 5% band
    assert _trends(client)["left_over"]["direction"] == "flat"


def test_sales_trend_uses_sale_records(client):
    _tx(client, "INCOME", 1_00, 20)  # history marker
    _sale_row(60_000_00, 2)
    _sale_row(100_000_00, 10)
    m = _trends(client)
    assert m["sales"]["direction"] == "down" and m["sales"]["tone"] == "bad"
    assert m["sales"]["change_pct"] == "−40.0"


# ---------------------------------------------------------------------------
# Watch: sales down / expenses up / profit squeezed
# ---------------------------------------------------------------------------

def test_sales_down_alert_with_severity(client):
    _sale_row(100_000_00, 10)
    _sale_row(60_000_00, 2)  # −40% → beyond the 30% critical line
    alerts = {a["id"]: a for a in _watch(client)}
    a = alerts["watch-sales-down"]
    assert a["severity"] == "critical"
    assert "fallen 40%" in a["what"]
    assert a["why"] and a["action"]  # what / why / what-to-do all present


def test_expenses_up_alert_names_the_driver(client):
    cats = client.get(f"{BASE}/categories?kind=EXPENSE").json()["data"]
    transport = next(c["id"] for c in cats if c["name"] == "Transport")
    _tx(client, "EXPENSE", 10_000_00, 9)
    _tx(client, "EXPENSE", 50_000_00, 2, category_id=transport)
    alerts = {a["id"]: a for a in _watch(client)}
    a = alerts["watch-expenses-up"]
    assert a["severity"] == "critical"  # +400%
    assert "Transport" in a["why"]  # actionable: names the biggest driver


def test_profit_squeeze_only_when_sales_held(client):
    # sales steady (Sale rows), but costs jumped → profit-down fires, sales-down doesn't
    _sale_row(100_000_00, 10)
    _sale_row(100_000_00, 2)
    _tx(client, "INCOME", 100_000_00, 10)
    _tx(client, "INCOME", 100_000_00, 2)
    _tx(client, "EXPENSE", 10_000_00, 9)
    _tx(client, "EXPENSE", 13_900_00, 9)  # prev out 23,900 → prev left 76,100
    _tx(client, "EXPENSE", 60_000_00, 2)  # cur left 40,000 → −47%
    ids = [a["id"] for a in _watch(client)]
    assert "watch-profit-down" in ids
    assert "watch-sales-down" not in ids


# ---------------------------------------------------------------------------
# Watch: stock, debts, unusual cost, incomplete records
# ---------------------------------------------------------------------------

def _create_product(client, name="Rice (bag)", selling=350_00, cost=300_00, threshold=5, initial=3):
    r = client.post(
        f"{BASE}/products",
        json={"name": name, "unit": "bag", "selling_price_minor": selling, "cost_price_minor": cost, "low_stock_threshold": threshold, "initial_stock": initial},
    )
    assert r.status_code == 201
    return r.json()["data"]["id"]


def test_low_stock_then_out_of_stock_updates_as_data_changes(client):
    pid = _create_product(client, initial=3)  # 3 ≤ threshold 5
    ids = [a["id"] for a in _watch(client)]
    assert "watch-low-stock" in ids and "watch-out-of-stock" not in ids

    r = client.post(f"{BASE}/products/{pid}/stock-check", json={"counted": 0, "reason": "COUNTED"})
    assert r.status_code in (200, 201)
    alerts = {a["id"]: a for a in _watch(client)}
    assert "watch-out-of-stock" in alerts and alerts["watch-out-of-stock"]["severity"] == "critical"
    assert "watch-low-stock" not in alerts  # replaced, not stacked


def test_overdue_debt_severity_scales_with_age(client):
    with SessionLocal() as db:
        db.add(Party(id="c-x", business_id="b-1", kind="customer", name="Test Customer"))
        db.flush()
        db.add(Debt(id="r-t1", business_id="b-1", kind="receivable", counterparty_id="c-x", amount_minor=50_000_00, settled_minor=0, since=utcnow() - timedelta(days=10), due_date=utcnow() - timedelta(days=3), source="MANUAL"))
        db.commit()
    alerts = {a["id"]: a for a in _watch(client)}
    assert alerts["watch-overdue"]["severity"] == "warning"

    with SessionLocal() as db:
        db.add(Debt(id="r-t2", business_id="b-1", kind="receivable", counterparty_id="c-x", amount_minor=10_000_00, settled_minor=0, since=utcnow() - timedelta(days=60), due_date=utcnow() - timedelta(days=45), source="MANUAL"))
        db.commit()
    alerts = {a["id"]: a for a in _watch(client)}
    assert alerts["watch-overdue"]["severity"] == "critical"  # 45 days > 30
    assert "2 customer payments are overdue" in alerts["watch-overdue"]["what"]


def test_unusual_purchase_cost_flagged_once(client):
    pid = _create_product(client, initial=10, cost=1_000_00)
    r = client.post(f"{BASE}/products/{pid}/stock", json={"quantity": 5, "unit_cost_minor": 100_00, "paid": True})
    assert r.status_code in (200, 201)
    alerts = [a for a in _watch(client) if a["id"].startswith("watch-unusual-cost")]
    assert len(alerts) == 1  # representative alert, never a wall
    # both the recorded cost and the usual cost appear, so the owner can judge
    # (add-stock updates the product's cost to the latest purchase price, so the
    # deviating movement is the opening one — the comparison is still honest)
    assert "Le 1,000" in alerts[0]["what"] and "Le 100" in alerts[0]["what"]


def test_incomplete_records_alert(client):
    for i in range(3):
        _tx(client, "EXPENSE", 5_000_00, i + 1)  # no category, no note → "General expense"
    alerts = {a["id"]: a for a in _watch(client)}
    assert "watch-incomplete" in alerts
    assert alerts["watch-incomplete"]["severity"] == "info"


# ---------------------------------------------------------------------------
# No duplicates: alerts are derived state, not an accumulating log
# ---------------------------------------------------------------------------

def test_watch_is_stable_and_never_accumulates(client):
    _create_product(client, initial=2)
    first = _watch(client)
    second = _watch(client)
    assert [a["id"] for a in first] == [a["id"] for a in second]
    assert len({a["id"] for a in second}) == len(second)  # ids unique


def test_watch_and_trends_are_tenant_guarded(other_client):
    assert other_client.get(f"{BASE}/watch").status_code == 404
    assert other_client.get(f"{BASE}/analytics/trends").status_code == 404
