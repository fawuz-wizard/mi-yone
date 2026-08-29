"""Scan-to-sell checkout: server-computed totals, stock validation, idempotency,
and full integration (ledger, movements, Watch, analytics, Partner)."""
BASE = "/api/v1/businesses/b-1"


def _product(client, name, price, stock, threshold=5):
    r = client.post(f"{BASE}/products", json={"name": name, "selling_price_minor": price, "initial_stock": stock, "low_stock_threshold": threshold})
    assert r.status_code == 201
    return r.json()["data"]["id"]


def test_checkout_computes_total_server_side_and_updates_everything(client):
    rice = _product(client, "Rice (bag)", 350_00, 10)
    oil = _product(client, "Oil (bottle)", 50_00, 20)
    r = client.post(
        f"{BASE}/sales/checkout",
        json={"items": [{"product_id": rice, "quantity": 2}, {"product_id": oil, "quantity": 3}]},
        headers={"Idempotency-Key": "chk-1"},
    )
    assert r.status_code == 201
    data = r.json()["data"]
    assert data["total"]["amount_minor"] == 2 * 350_00 + 3 * 50_00  # server math, not client
    assert len(data["lines"]) == 2
    assert data["transaction"]["type"] == "INCOME"
    assert "Rice (bag) ×2" in data["transaction"]["description"]

    # stock moved through the movement ledger
    products = {p["id"]: p for p in client.get(f"{BASE}/products").json()["data"]}
    assert products[rice]["stock"] == 8
    assert products[oil]["stock"] == 17
    # the money is in the books (analytics see it)
    dash = client.get(f"{BASE}/analytics/dashboard?period=today").json()["data"]
    assert dash["health"]["money_in"]["amount_minor"] == 850_00
    # and the Partner can explain it
    ask = client.post(f"{BASE}/partner/messages", json={"text": "How much did I make from rice?"})
    assert "2" in ask.json()["data"]["partner"]["text"]


def test_checkout_is_idempotent_one_key_one_sale(client):
    rice = _product(client, "Rice (bag)", 350_00, 10)
    body = {"items": [{"product_id": rice, "quantity": 1}]}
    first = client.post(f"{BASE}/sales/checkout", json=body, headers={"Idempotency-Key": "chk-dup"})
    assert first.status_code == 201
    replay = client.post(f"{BASE}/sales/checkout", json=body, headers={"Idempotency-Key": "chk-dup"})
    assert replay.status_code == 200  # replayed, not re-recorded
    rows = client.get(f"{BASE}/transactions").json()["data"]
    assert len([t for t in rows if t["type"] == "INCOME"]) == 1
    products = {p["id"]: p for p in client.get(f"{BASE}/products").json()["data"]}
    assert products[rice]["stock"] == 9  # decremented exactly once


def test_checkout_rejects_insufficient_stock_before_anything_moves(client):
    rice = _product(client, "Rice (bag)", 350_00, 3)
    r = client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": rice, "quantity": 5}]})
    assert r.status_code == 422
    assert "only 3 left" in r.json()["error"]["message"]
    # nothing was recorded
    products = {p["id"]: p for p in client.get(f"{BASE}/products").json()["data"]}
    assert products[rice]["stock"] == 3
    assert client.get(f"{BASE}/transactions").json()["data"] == []


def test_checkout_rejects_unknown_product_and_bad_quantities(client):
    rice = _product(client, "Rice (bag)", 350_00, 10)
    assert client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": "p-nope", "quantity": 1}]}).status_code == 422
    assert client.post(f"{BASE}/sales/checkout", json={"items": []}).status_code == 422
    assert client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": rice, "quantity": 0}]}).status_code == 422
    # duplicate lines must be combined by the client, not double-counted silently
    dup = client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": rice, "quantity": 1}, {"product_id": rice, "quantity": 1}]})
    assert dup.status_code == 422


def test_checkout_is_tenant_isolated(client, other_client):
    rice = _product(client, "Rice (bag)", 350_00, 10)
    # the other business cannot sell this product — even by guessing its id
    r = other_client.post("/api/v1/businesses/b-2/sales/checkout", json={"items": [{"product_id": rice, "quantity": 1}]})
    assert r.status_code == 422  # not in b-2's records
    assert other_client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": rice, "quantity": 1}]}).status_code == 404


def test_checkout_feeds_business_watch_low_stock(client):
    rice = _product(client, "Rice (bag)", 350_00, 6, threshold=5)
    client.post(f"{BASE}/sales/checkout", json={"items": [{"product_id": rice, "quantity": 3}]})
    alerts = client.get(f"{BASE}/watch").json()["data"]["alerts"]
    assert any(a["id"] == "watch-low-stock" for a in alerts)  # 3 left ≤ 5
