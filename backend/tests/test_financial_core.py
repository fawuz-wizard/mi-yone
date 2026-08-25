"""Financial correctness — the most protected code in MI YONE (Phase 2 §29)."""
from app.common.money import format_money


def test_money_formatting():
    assert format_money(4_500_000)["display"] == "Le 45,000"
    assert format_money(150_050)["display"] == "Le 1,500.50"
    assert format_money(0)["display"] == "Le 0"
    assert format_money(-2_640_000)["display"] == "Le −26,400"


def _post_tx(client, amount=4_500_000, key=None, type_="INCOME"):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post("/api/v1/businesses/b-1/transactions", json={"type": type_, "amount_minor": amount, "source": "MANUAL"}, headers=headers)


def test_idempotency_replay_creates_one_record(client):
    r1 = _post_tx(client, key="k-abc")
    r2 = _post_tx(client, key="k-abc")
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["data"]["id"] == r2.json()["data"]["id"]
    rows = client.get("/api/v1/businesses/b-1/transactions").json()["data"]
    assert len(rows) == 1


def test_amount_validation(client):
    assert _post_tx(client, amount=0).status_code == 422
    assert _post_tx(client, amount=-100).status_code == 422
    assert _post_tx(client, amount=200_000_000_000).status_code == 422


def test_fix_is_reversal_plus_correction_with_history(client):
    tx_id = _post_tx(client, amount=450_000).json()["data"]["id"]
    fixed = client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/fix", json={"amount_minor": 4_500_000, "reason": "correction"})
    assert fixed.status_code == 200
    body = fixed.json()["data"]
    assert body["fixed"]["was"]["display"] == "Le 4,500"
    assert body["fixed"]["now"]["display"] == "Le 45,000"
    # Visible ledger holds exactly the corrected row; sums reflect only it.
    rows = client.get("/api/v1/businesses/b-1/transactions").json()["data"]
    assert len(rows) == 1 and rows[0]["amount"]["display"] == "Le 45,000"
    # The original cannot be fixed twice.
    again = client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/fix", json={"amount_minor": 1_000, "reason": "x"})
    assert again.status_code == 409


def test_reverse_removes_from_books_but_not_from_history(client):
    tx_id = _post_tx(client).json()["data"]["id"]
    assert client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/reverse").status_code == 200
    assert client.get("/api/v1/businesses/b-1/transactions").json()["data"] == []
    # The row still exists (REVERSED) — nothing was destroyed.
    detail = client.get(f"/api/v1/businesses/b-1/transactions/{tx_id}").json()["data"]
    assert detail["status"] == "REVERSED"
    # Double reversal refused.
    assert client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/reverse").status_code == 409


def test_dashboard_sums_are_live_and_exclude_reversed(client):
    a = _post_tx(client, amount=10_000_00).json()["data"]["id"]
    _post_tx(client, amount=5_000_00, type_="EXPENSE")
    d1 = client.get("/api/v1/businesses/b-1/analytics/dashboard?period=today").json()["data"]["health"]
    assert d1["left_over"]["amount_minor"] == 5_000_00
    client.post(f"/api/v1/businesses/b-1/transactions/{a}/reverse")
    d2 = client.get("/api/v1/businesses/b-1/analytics/dashboard?period=today").json()["data"]["health"]
    assert d2["left_over"]["amount_minor"] == -5_000_00
