def _customer(client):
    return client.post("/api/v1/businesses/b-1/customers", json={"name": "Aminata"}).json()["data"]["id"]


def test_credit_sale_books_receivable_not_cash(client):
    cid = _customer(client)
    r = client.post(
        "/api/v1/businesses/b-1/sales",
        json={"amount_minor": 6_200_000, "payment": "CREDIT", "customer_id": cid},
        headers={"Idempotency-Key": "sale-1"},
    )
    assert r.status_code == 201
    body = r.json()["data"]
    assert body["transaction"] is None
    assert body["receivable"]["outstanding"]["display"] == "Le 62,000"
    # Cash view unchanged; report books the credit.
    cash = client.get("/api/v1/businesses/b-1/analytics/dashboard?period=today").json()["data"]["health"]
    assert cash["money_in"]["amount_minor"] == 0
    report = client.get("/api/v1/businesses/b-1/reports?period=today").json()["data"]
    assert report["profit"]["credit_extended"]["amount_minor"] == 6_200_000
    assert report["profit"]["booked_revenue"]["amount_minor"] == 6_200_000
    # Sale idempotency: replay returns same receivable, no duplicate.
    r2 = client.post(
        "/api/v1/businesses/b-1/sales",
        json={"amount_minor": 6_200_000, "payment": "CREDIT", "customer_id": cid},
        headers={"Idempotency-Key": "sale-1"},
    )
    assert r2.status_code == 200
    assert len(client.get("/api/v1/businesses/b-1/receivables").json()["data"]) == 1


def test_settlement_pays_debt_and_creates_cash_no_double_count(client):
    cid = _customer(client)
    debt = client.post("/api/v1/businesses/b-1/receivables", json={"counterparty_id": cid, "amount_minor": 3_000_000}).json()["data"]
    pay = client.post(f"/api/v1/businesses/b-1/debts/{debt['id']}/settlements", json={"amount_minor": 2_000_000})
    assert pay.status_code == 201
    assert pay.json()["data"]["debt"]["outstanding"]["amount_minor"] == 1_000_000
    tx = pay.json()["data"]["transaction"]
    assert tx["source"] == "SETTLEMENT" and tx["counterparty_id"] == cid
    # Over-settlement is rejected.
    over = client.post(f"/api/v1/businesses/b-1/debts/{debt['id']}/settlements", json={"amount_minor": 5_000_000})
    assert over.status_code == 422
    # Booked revenue excludes the collection (only cash counts it).
    report = client.get("/api/v1/businesses/b-1/reports?period=today").json()["data"]
    assert report["cash"]["money_in"]["amount_minor"] == 2_000_000
    assert report["profit"]["booked_revenue"]["amount_minor"] == 0  # manual debt isn't revenue


def test_add_stock_on_credit_creates_payable_and_movement(client):
    sid = client.post("/api/v1/businesses/b-1/suppliers", json={"name": "Musa"}).json()["data"]["id"]
    pid = client.post(
        "/api/v1/businesses/b-1/products",
        json={"name": "Rice", "selling_price_minor": 8_500_000, "cost_price_minor": 7_000_000},
    ).json()["data"]["id"]
    r = client.post(
        f"/api/v1/businesses/b-1/products/{pid}/stock",
        json={"quantity": 10, "unit_cost_minor": 7_000_000, "paid": False, "supplier_id": sid},
    )
    assert r.status_code == 201
    assert r.json()["data"]["product"]["stock"] == 10
    payables = client.get("/api/v1/businesses/b-1/payables").json()["data"]
    assert payables[0]["outstanding"]["amount_minor"] == 70_000_000
    # Stock check: owner states 7, server computes −3 damage.
    check = client.post(f"/api/v1/businesses/b-1/products/{pid}/stock-check", json={"counted": 7, "reason": "DAMAGED"})
    assert check.json()["data"]["movement"]["quantity_delta"] == -3
    assert check.json()["data"]["product"]["stock"] == 7
