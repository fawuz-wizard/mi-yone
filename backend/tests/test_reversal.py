"""Whole-sale reversal (owner hardening brief, P0-1).

Before this, "Remove this record" reversed only the cash line of a sale. The
sale row, its stock movement and its receivable all stayed standing, so
Reports could show "money in Le 0" and "1 sale, Le 50,000" at the same time,
stock stayed short, and a cancelled credit sale inflated booked revenue for
ever. These tests hold every surface to the same answer.
"""
BASE = "/api/v1/businesses/b-1"


def _product(client, name="Rice (bag)", price=350_00, stock=10):
    r = client.post(f"{BASE}/products", json={"name": name, "selling_price_minor": price, "initial_stock": stock})
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _customer(client, name="Aminata"):
    r = client.post(f"{BASE}/customers", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _stock(client, pid):
    return next(p for p in client.get(f"{BASE}/products").json()["data"] if p["id"] == pid)["stock"]


def _report(client):
    return client.get(f"{BASE}/reports?period=month").json()["data"]


def test_removing_a_cash_sale_reverses_cash_stock_and_the_sale_count(client):
    p = _product(client)
    r = client.post(f"{BASE}/sales", json={
        "amount_minor": 700_00, "payment": "PAID", "product_id": p["id"], "quantity": 2,
    })
    assert r.status_code == 201, r.text
    tx_id = r.json()["data"]["transaction"]["id"]
    assert _stock(client, p["id"]) == 8

    before = _report(client)
    assert before["sales"]["count"] == 1
    assert before["cash"]["money_in"]["amount_minor"] == 700_00

    assert client.post(f"{BASE}/transactions/{tx_id}/reverse", json={}).status_code == 200

    after = _report(client)
    # Every surface agrees: no cash, no sale, and the stock is back.
    assert after["cash"]["money_in"]["amount_minor"] == 0
    assert after["sales"]["count"] == 0
    assert after["sales"]["total"]["amount_minor"] == 0
    assert after["sales"]["top_products"] == []
    assert _stock(client, p["id"]) == 10


def test_removing_a_credit_sale_cancels_the_receivable_and_the_booked_revenue(client):
    p = _product(client)
    c = _customer(client)
    r = client.post(f"{BASE}/sales", json={
        "amount_minor": 350_00, "payment": "CREDIT", "customer_id": c["id"],
        "product_id": p["id"], "quantity": 1,
    })
    assert r.status_code == 201, r.text
    debt_id = r.json()["data"]["receivable"]["id"]
    assert _report(client)["profit"]["booked_revenue"]["amount_minor"] == 350_00

    # A credit sale creates no cash row, so the debt is the only door to it.
    assert client.post(f"{BASE}/debts/{debt_id}/reverse", json={}).status_code == 200

    after = _report(client)
    assert after["profit"]["booked_revenue"]["amount_minor"] == 0
    assert after["sales"]["count"] == 0
    assert client.get(f"{BASE}/receivables").json()["data"] == []
    assert _stock(client, p["id"]) == 10
    # The customer's own page agrees too.
    detail = client.get(f"{BASE}/customers/{c['id']}").json()["data"]
    party = detail.get("party", detail)
    assert party["outstanding"]["amount_minor"] == 0


def test_reversing_a_payment_puts_the_money_back_on_the_debt(client):
    """The duplicate-payment case: the ledger must lose the cash AND the debt
    must go back to being owed, or nobody ever chases it again."""
    c = _customer(client)
    debt = client.post(f"{BASE}/receivables", json={"counterparty_id": c["id"], "amount_minor": 200_00}).json()["data"]
    pay = client.post(f"{BASE}/debts/{debt['id']}/settlements", json={"amount_minor": 200_00})
    assert pay.status_code == 201, pay.text
    tx_id = pay.json()["data"]["transaction"]["id"]
    assert client.get(f"{BASE}/receivables").json()["data"] == []  # settled, so it drops off

    assert client.post(f"{BASE}/transactions/{tx_id}/reverse", json={}).status_code == 200

    owed = client.get(f"{BASE}/receivables").json()["data"]
    assert len(owed) == 1 and owed[0]["outstanding"]["amount_minor"] == 200_00
    assert _report(client)["cash"]["money_in"]["amount_minor"] == 0


def test_removing_a_partly_paid_credit_sale_reverses_its_payments_too(client):
    p = _product(client)
    c = _customer(client)
    sale = client.post(f"{BASE}/sales", json={
        "amount_minor": 500_00, "payment": "PARTIAL", "amount_paid_minor": 200_00,
        "customer_id": c["id"], "product_id": p["id"], "quantity": 1,
    }).json()["data"]
    debt_id = sale["receivable"]["id"]
    client.post(f"{BASE}/debts/{debt_id}/settlements", json={"amount_minor": 100_00})

    assert client.post(f"{BASE}/transactions/{sale['transaction']['id']}/reverse", json={}).status_code == 200

    after = _report(client)
    assert after["cash"]["money_in"]["amount_minor"] == 0  # the deposit AND the later payment
    assert after["sales"]["count"] == 0
    assert client.get(f"{BASE}/receivables").json()["data"] == []
    assert _stock(client, p["id"]) == 10


def test_a_removed_sale_is_gone_from_watch_trends_and_the_partner(client):
    p = _product(client, stock=3, name="Sugar (kg)")
    tx = client.post(f"{BASE}/sales", json={
        "amount_minor": 300_00, "payment": "PAID", "product_id": p["id"], "quantity": 3,
    }).json()["data"]["transaction"]
    # Selling the last 3 makes it sold out.
    assert any("sold out" in a["what"].lower() for a in client.get(f"{BASE}/watch").json()["data"]["alerts"])

    client.post(f"{BASE}/transactions/{tx['id']}/reverse", json={})

    alerts = client.get(f"{BASE}/watch").json()["data"]["alerts"]
    assert not any("sold out" in a["what"].lower() for a in alerts)
    units = next(m for m in client.get(f"{BASE}/analytics/trends").json()["data"]["metrics"] if m["key"] == "units_sold")
    current = units["current"]
    assert (current["amount_minor"] if isinstance(current, dict) else int(current)) == 0
    ask = client.post(f"{BASE}/partner/messages", json={"text": "Which products are selling the most?"})
    assert "No product sales are recorded" in ask.json()["data"]["partner"]["text"]


def test_a_sale_cannot_be_removed_twice(client):
    p = _product(client)
    tx = client.post(f"{BASE}/sales", json={
        "amount_minor": 350_00, "payment": "PAID", "product_id": p["id"], "quantity": 1,
    }).json()["data"]["transaction"]
    assert client.post(f"{BASE}/transactions/{tx['id']}/reverse", json={}).status_code == 200
    again = client.post(f"{BASE}/transactions/{tx['id']}/reverse", json={})
    assert again.status_code == 409


def test_a_supplier_payable_is_refused_rather_than_half_removed(client):
    """Removing only the debt would leave the stock and the expense standing —
    exactly the defect this work exists to fix. Refuse it plainly instead."""
    p = _product(client, stock=0)
    r = client.post(f"{BASE}/products/{p['id']}/stock", json={
        "quantity": 5, "unit_cost_minor": 300_00, "paid": False,
        "supplier_id": client.post(f"{BASE}/suppliers", json={"name": "Musa"}).json()["data"]["id"],
    })
    assert r.status_code in (200, 201), r.text
    payable = client.get(f"{BASE}/payables").json()["data"][0]
    refused = client.post(f"{BASE}/debts/{payable['id']}/reverse", json={})
    assert refused.status_code == 422
    assert "stock purchase" in refused.json()["error"]["message"].lower()


def test_stock_cannot_go_negative_on_a_single_sale(client):
    """checkout already refused this; the single-sale path did not."""
    p = _product(client, stock=3)
    r = client.post(f"{BASE}/sales", json={
        "amount_minor": 1000_00, "payment": "PAID", "product_id": p["id"], "quantity": 10,
    })
    assert r.status_code == 422
    assert "not enough" in r.json()["error"]["message"].lower()
    assert _stock(client, p["id"]) == 3


# ---------------------------------------------------------------------------
# Historical revenue + export accuracy (owner hardening brief, P0-2 and P0-7)
# ---------------------------------------------------------------------------

def test_changing_a_price_does_not_rewrite_what_past_sales_earned(client):
    """The rice case: sell at one price, raise the price, and last month's
    figures must not move. Sale movements carry the price they were sold at."""
    p = _product(client, price=350_00, stock=10)
    client.post(f"{BASE}/sales", json={
        "amount_minor": 700_00, "payment": "PAID", "product_id": p["id"], "quantity": 2,
    })
    before = _report(client)["sales"]["top_products"][0]
    assert before["revenue_estimate"]["amount_minor"] == 700_00
    assert before["revenue_exact"] is True

    # The owner raises the price today.
    assert client.patch(f"{BASE}/products/{p['id']}", json={"selling_price_minor": 400_00}).status_code == 200

    after = _report(client)["sales"]["top_products"][0]
    assert after["revenue_estimate"]["amount_minor"] == 700_00, "a price change rewrote a closed sale"
    assert after["units"] == 2

    partner = client.post(f"{BASE}/partner/messages", json={"text": "How much did I make from rice?"})
    assert "Le 700" in partner.json()["data"]["partner"]["text"]


def test_a_bundled_sale_is_marked_inexact_rather_than_invented(client):
    """Two items for a price that does not divide evenly has no honest
    per-unit figure — say so instead of pretending."""
    p = _product(client, price=300_00, stock=10)
    client.post(f"{BASE}/sales", json={
        "amount_minor": 505_00, "payment": "PAID", "product_id": p["id"], "quantity": 3,
    })
    top = _report(client)["sales"]["top_products"][0]
    assert top["revenue_exact"] is False


def test_csv_keeps_exact_amounts_and_cannot_carry_a_formula(client):
    client.post(f"{BASE}/transactions", json={
        "type": "INCOME", "amount_minor": 1_234_567_89, "source": "MANUAL",
        "description": "=cmd|calc",
    })
    csv = client.get(f"{BASE}/reports/export?period=month").text
    assert "1234567.89" in csv, "large amounts must not be rounded or go scientific"
    assert "e+" not in csv
    assert "\"'=cmd|calc\"" in csv, "a leading = must be neutralised for spreadsheets"
