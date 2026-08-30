"""Overview refinement (M17): period spending summary, profit margin,
contribution analysis, and the Partner overview line.

Laws under test: margin never computed on a zero-revenue base; Overview profit
comes from the SAME report() logic Reports use; contributors state measured
changes only (contribution, never causation) and are withheld entirely without
history; the Partner line upgrades the insight slot only when history allows.
"""
from datetime import timedelta

from app.models import utcnow

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


def _expense_cats(client) -> list[dict]:
    r = client.get(f"{BASE}/categories?kind=EXPENSE")
    assert r.status_code == 200
    return r.json()["data"]


def _dash(client, period="week") -> dict:
    r = client.get(f"{BASE}/analytics/dashboard?period={period}")
    assert r.status_code == 200
    return r.json()["data"]


def _trends(client) -> dict:
    r = client.get(f"{BASE}/analytics/trends?range=30d")
    assert r.status_code == 200
    return r.json()["data"]


def test_empty_business_shows_nothing_invented(client):
    d = _dash(client)
    assert d["spending"] is None
    assert d["profit"] is None
    assert _trends(client)["contributors"] == []


def test_spending_summary_ranks_biggest_first_and_matches_reports(client):
    cats = _expense_cats(client)
    _tx(client, "EXPENSE", 50_000, 1, cats[0]["id"])
    _tx(client, "EXPENSE", 200_000, 2, cats[1]["id"])
    d = _dash(client, "week")
    assert d["spending"]["total"]["amount_minor"] == 250_000
    top = d["spending"]["top"]
    assert top[0]["name"] == cats[1]["name"]
    assert top[0]["total"]["amount_minor"] == 200_000
    # Overview summary and Reports detail must agree on the ranking.
    rep = client.get(f"{BASE}/reports?period=week").json()["data"]
    assert rep["expenses_by_category"][0]["name"] == top[0]["name"]
    assert rep["expenses_by_category"][0]["total"]["amount_minor"] == 200_000


def test_margin_absent_on_zero_revenue_and_consistent_with_reports(client):
    cats = _expense_cats(client)
    _tx(client, "EXPENSE", 10_000, 0, cats[0]["id"])
    d = _dash(client, "week")
    # Expenses but no revenue: profit shown (a loss), margin honestly absent.
    assert d["profit"]["estimated"]["amount_minor"] == -10_000
    assert d["profit"]["margin_pct"] is None

    _tx(client, "INCOME", 40_000, 0)
    d = _dash(client, "week")
    rep = client.get(f"{BASE}/reports?period=week").json()["data"]
    assert d["profit"]["estimated"]["amount_minor"] == rep["profit"]["profit"]["amount_minor"] == 30_000
    # 30,000 / 40,000 = 75% — same figures Reports show.
    assert d["profit"]["margin_pct"] == "75"


def test_contributors_state_measured_changes_never_causes(client):
    cats = _expense_cats(client)
    # Previous window (days 31–60): category A Le 100, category B Le 200.
    _tx(client, "EXPENSE", 10_000, 40, cats[0]["id"])
    _tx(client, "EXPENSE", 20_000, 40, cats[1]["id"])
    # Current window: A jumps by Le 800 (largest change), B rises by Le 100.
    _tx(client, "EXPENSE", 90_000, 5, cats[0]["id"])
    _tx(client, "EXPENSE", 30_000, 5, cats[1]["id"])
    t = _trends(client)
    spend = next(c for c in t["contributors"] if c["id"] == "contrib-spending")
    assert cats[0]["name"] in spend["text"]
    assert "increased by Le 800" in spend["text"]
    assert "largest change" in spend["text"]
    # Contribution language only — never causal claims.
    for c in t["contributors"]:
        assert "caused" not in c["text"].lower()
        assert "because" not in c["text"].lower()
    # Money-in/out contributor is present and factual.
    assert any(c["id"] == "contrib-left-over" for c in t["contributors"])


def test_contributors_withheld_without_history(client):
    _tx(client, "INCOME", 40_000, 0)
    assert _trends(client)["contributors"] == []


def test_partner_line_upgrades_insight_only_with_history(client):
    cats = _expense_cats(client)
    # No history: the deterministic top-expense insight (or none) stands.
    _tx(client, "EXPENSE", 15_000, 0, cats[0]["id"])
    d = _dash(client)
    assert d["insight"] is None or d["insight"]["id"] != "ins-partner-overview"

    # With history the Partner line appears, grounded in the same trends.
    _tx(client, "INCOME", 50_000, 40)
    _tx(client, "INCOME", 80_000, 3)
    d = _dash(client)
    ins = d["insight"]
    assert ins["id"] == "ins-partner-overview"
    t = _trends(client)
    left = next(m for m in t["metrics"] if m["key"] == "left_over")
    assert ins["figure"] == left["current"]
    # The context is a contributor sentence or the honest comparison note.
    assert ins["context"] in [c["text"] for c in t["contributors"]] + ["Compared with the 30 days before."]
    assert ins["action_target"] == "/partner"
