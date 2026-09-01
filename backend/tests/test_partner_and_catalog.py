"""Partner AI + WhatsApp catalog integration.
Covers the brief's matrix: questions where data exists / doesn't, insufficient
history, no fabricated numbers, Watch/Analytics integration, import flow,
duplicate detection, incomplete items, failed imports, tenant isolation."""
import re
from datetime import timedelta

from app.core.db import SessionLocal
from app.models import Sale, utcnow
from app.services import catalog_import

BASE = "/api/v1/businesses/b-1"


def _ask(client, text: str) -> dict:
    r = client.post(f"{BASE}/partner/messages", json={"text": text})
    assert r.status_code == 201
    return r.json()["data"]["partner"]


def _tx(client, type_, amount, days_ago):
    iso = (utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S")
    r = client.post(f"{BASE}/transactions", json={"type": type_, "amount_minor": amount, "source": "MANUAL", "occurred_at": iso})
    assert r.status_code in (200, 201)


# ---------------------------------------------------------------------------
# Partner: honesty before intelligence
# ---------------------------------------------------------------------------

def test_empty_business_answers_honestly_with_no_numbers(client):
    d = _ask(client, "How is my business doing this month?")
    assert d["intent"] == "overview"
    assert "don't have any money records" in d["text"]
    assert "Le " not in d["text"]  # zero fabricated figures


def test_profit_question_with_no_history_says_so(client):
    _tx(client, "INCOME", 50_000_00, 2)  # current window only
    d = _ask(client, "Why did my profit decrease?")
    assert "don't have enough history" in d["text"]


def test_answers_use_only_recorded_figures(client):
    _tx(client, "INCOME", 100_000_00, 10)
    _tx(client, "INCOME", 60_000_00, 2)
    _tx(client, "EXPENSE", 20_000_00, 1)
    d = _ask(client, "Why did my profit decrease?")
    # every Le figure in the reply must be derivable from the recorded amounts
    figures = set(re.findall(r"Le [\d,]+", d["text"]))
    allowed = {"Le 100,000", "Le 60,000", "Le 20,000", "Le 40,000"}  # cur left 40,000, prev 100,000
    assert figures <= allowed, figures


def test_unknown_question_gets_capabilities_not_a_guess(client):
    d = _ask(client, "what's the weather like")
    assert d["intent"] == "help"
    assert "never make figures up" in d["text"] or "recorded data" in d["text"]


def test_product_question_without_sales_is_honest(client):
    r = client.post(f"{BASE}/products", json={"name": "Rice (bag)", "selling_price_minor": 350_00, "initial_stock": 8})
    assert r.status_code == 201
    d = _ask(client, "How much did I make from rice?")
    assert d["intent"] == "product"
    assert "don't have any recorded sales of Rice (bag)" in d["text"]
    assert "8" in d["text"]  # current stock is a verified fact


def test_watch_integration_answers_attention(client):
    client.post(f"{BASE}/products", json={"name": "Oil (bottle)", "selling_price_minor": 100_00, "low_stock_threshold": 5, "initial_stock": 2})
    d = _ask(client, "What should I pay attention to?")
    assert d["intent"] == "attention"
    assert "running low" in d["text"]  # straight from Business Watch


def test_trends_integration_in_overview(client):
    # Dated TODAY, not "2 days ago": "this month" is calendar month-to-date, so
    # a record 2 days old falls in the previous month on the 1st and 2nd and the
    # test failed on those two days a month. The behaviour under test is the
    # trends line, not the calendar.
    _tx(client, "INCOME", 100_000_00, 40)  # history exists
    _tx(client, "INCOME", 150_000_00, 0)
    d = _ask(client, "How is my business doing this month?")
    assert "Compared with the 30 days before" in d["text"]


def test_partner_conversation_persists_and_is_isolated(client, other_client):
    _ask(client, "Who owes me money?")
    hist = client.get(f"{BASE}/partner/messages").json()["data"]
    assert len(hist["messages"]) == 2  # owner + partner
    assert hist["provider"] == "local"
    # another business's owner cannot read or ask here
    assert other_client.get(f"{BASE}/partner/messages").status_code == 404
    assert other_client.post(f"{BASE}/partner/messages", json={"text": "hi"}).status_code == 404


def test_partner_never_writes_business_records(client):
    before = client.get(f"{BASE}/transactions").json()["data"]
    _ask(client, "Record a sale of 500")  # even an instruction-like message
    after = client.get(f"{BASE}/transactions").json()["data"]
    assert len(before) == len(after)  # chat cannot create financial records


# ---------------------------------------------------------------------------
# WhatsApp catalog: connect → import → review → approve/skip
# ---------------------------------------------------------------------------

WA = f"{BASE}/integrations/whatsapp"


def _connect_and_import(client) -> dict:
    assert client.post(f"{WA}/connect").json()["data"]["mode"] == "test"
    r = client.post(f"{WA}/imports")
    assert r.status_code == 201
    return r.json()["data"]


def test_import_flow_states_and_review(client):
    assert client.get(WA).json()["data"]["connection"] is None
    imp = _connect_and_import(client)
    assert imp["status"] == "IMPORTED"
    assert imp["needs_review"] == len(imp["items"]) > 0
    assert all(i["status"] == "NEEDS_REVIEW" for i in imp["items"])


def test_duplicate_detection_against_existing_products(client):
    client.post(f"{BASE}/products", json={"name": "Rice (50kg bag)", "selling_price_minor": 85_000_00})
    imp = _connect_and_import(client)
    rice = next(i for i in imp["items"] if i["name"] == "Rice 50kg")
    assert rice["duplicate_name"] == "Rice (50kg bag)"
    fresh = next(i for i in imp["items"] if i["name"] == "Peak milk (tin)")
    assert fresh["duplicate_name"] is None


def test_incomplete_item_requires_a_price_to_approve(client):
    imp = _connect_and_import(client)
    maggi = next(i for i in imp["items"] if i["price"] is None)
    r = client.post(f"{WA}/items/{maggi['id']}/approve", json={})
    assert r.status_code == 422
    r = client.post(f"{WA}/items/{maggi['id']}/approve", json={"selling_price_minor": 3_000_00})
    assert r.status_code == 201
    assert r.json()["data"]["product"]["selling_price"]["display"] == "Le 3,000"


def test_approve_creates_a_normal_product_with_stock(client):
    imp = _connect_and_import(client)
    palm = next(i for i in imp["items"] if i["name"] == "Palm oil (1L)")
    r = client.post(f"{WA}/items/{palm['id']}/approve", json={"initial_stock": 10, "cost_price_minor": 20_000_00})
    assert r.status_code == 201
    product = r.json()["data"]["product"]
    assert product["stock"] == 10
    # it is a first-class product: appears in the normal product list
    names = [p["name"] for p in client.get(f"{BASE}/products").json()["data"]]
    assert "Palm oil (1L)" in names
    # double review is refused
    assert client.post(f"{WA}/items/{palm['id']}/approve", json={}).status_code == 409


def test_skip_marks_item_without_creating_a_product(client):
    imp = _connect_and_import(client)
    item = imp["items"][0]
    assert client.post(f"{WA}/items/{item['id']}/skip").status_code == 200
    products = client.get(f"{BASE}/products").json()["data"]
    assert all(p["name"] != item["name"] for p in products)


def test_failed_import_is_an_honest_state(client, monkeypatch):
    client.post(f"{WA}/connect")
    from app.services import catalog_import as ci

    class ExplodingProvider:
        mode = "test"
        def fetch(self):
            raise RuntimeError("network down")

    monkeypatch.setattr(ci, "get_catalog_provider", lambda: ExplodingProvider())
    r = client.post(f"{WA}/imports")
    assert r.status_code == 201
    assert r.json()["data"]["status"] == "FAILED"
    assert "could not be fetched" in r.json()["data"]["error"]


def test_catalog_is_tenant_isolated_and_role_guarded(client, other_client, staff_client):
    _connect_and_import(client)
    # other business: cannot even see the integration
    assert other_client.get(WA).status_code == 404
    assert other_client.post(f"{WA}/imports").status_code == 404
    # staff of the same business: can view, cannot import/approve (product management is ADMIN+)
    assert staff_client.get(WA).status_code == 200
    assert staff_client.post(f"{WA}/imports").status_code == 403


def test_imported_product_feeds_the_partner(client):
    imp = _connect_and_import(client)
    palm = next(i for i in imp["items"] if i["name"] == "Palm oil (1L)")
    pid = client.post(f"{WA}/items/{palm['id']}/approve", json={"initial_stock": 10}).json()["data"]["product"]["id"]
    # record sales against the imported product through the EXISTING sale path
    r = client.post(f"{BASE}/sales", json={"amount_minor": 75_000_00, "product_id": pid, "quantity": 3, "payment": "PAID"})
    assert r.status_code == 201
    d = _ask(client, "How much did I make from palm oil?")
    assert d["intent"] == "product"
    assert "3" in d["text"] and "Palm oil (1L)" in d["text"]
    assert "7" in d["text"]  # stock now 7


# ---------------------------------------------------------------------------
# Provider abstraction: external AI failure never breaks the owner's answer
# ---------------------------------------------------------------------------

def test_anthropic_provider_falls_back_to_grounded_facts(monkeypatch):
    from app.ai import providers

    def boom(*args, **kwargs):
        raise RuntimeError("api unreachable")

    monkeypatch.setattr(providers.httpx, "post", boom)
    p = providers.AnthropicProvider("fake-key", "fake-model")
    facts = ["From your records: money in Le 100,000."]
    assert p.compose("how am I doing", facts) == facts[0]  # grounded fallback, no crash


def test_default_provider_is_local_without_credentials():
    from app.ai.providers import get_provider

    assert get_provider().name == "local"  # no key configured → built-in composer
