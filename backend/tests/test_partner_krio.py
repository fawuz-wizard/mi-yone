"""Partner AI — Krio-first routing + conversation context (owner brief).

Krio, English, and mixed questions must land on the same intents; short
follow-ups ("Why?", "How much I make from am?") inherit the previous answer's
subject deterministically. Grounding rules are unchanged — every reply is
built only from evidence sentences over recorded data."""
from app.ai.evidence import route
from app.models import Product

BASE = "/api/v1/businesses/b-1"


def _products() -> list[Product]:
    return [Product(id="p-rice", business_id="b-1", name="Rice (50kg bag)", unit="bag", selling_minor=350_000, cost_minor=300_000)]


def test_krio_english_and_mixed_route_to_the_same_intents():
    cases = [
        ("How business dey go?", "overview"),
        ("How is my business doing?", "overview"),
        ("Dis month sales na how much?", "overview"),
        ("Why profit don go down?", "profit_why"),
        ("Why did my profit drop?", "profit_why"),
        ("Wetin I spend money on?", "expenses"),
        ("How much I spend this month?", "expenses"),
        ("Which product sell pass?", "top_products"),
        ("What are my best selling products?", "top_products"),
        ("Who owe me?", "debts"),
        ("Who owes me money?", "debts"),
        ("Compare this month with last month.", "compare"),
        ("What should I pay attention to?", "attention"),
    ]
    for q, expected in cases:
        intent, _ = route(q, _products())
        assert intent == expected, f"{q!r} routed to {intent}, expected {expected}"


def test_product_questions_win_in_both_languages():
    for q in ("Why rice sales decrease?", "How rice dey do compared to last month?", "how much did I make from rice"):
        intent, product = route(q, _products())
        assert intent == "product" and product is not None and "Rice" in product.name, q


def _ask(client, text: str) -> dict:
    r = client.post(f"{BASE}/partner/messages", json={"text": text})
    assert r.status_code == 201
    return r.json()["data"]["partner"]


def test_followups_inherit_the_previous_subject(client):
    # A real product with a real sale — the context anchor.
    p = client.post(f"{BASE}/products", json={"name": "Rice (50kg bag)", "selling_price_minor": 350_000, "initial_stock": 20}).json()["data"]
    client.post(f"{BASE}/sales", json={"amount_minor": 700_000, "product_id": p["id"], "quantity": 2, "payment": "PAID"},
                headers={"Idempotency-Key": "pk-1"})

    first = _ask(client, "How rice dey do?")
    assert first["intent"] == "product"
    assert "Rice" in first["text"]

    # "Why?" alone → still about rice, not the generic help text.
    why = _ask(client, "Why?")
    assert why["intent"] == "product"
    assert "Rice" in why["text"]

    # Pronoun follow-up → same product.
    how_much = _ask(client, "How much I make from am?")
    assert how_much["intent"] == "product"
    assert "Rice" in how_much["text"]


def test_why_after_overview_explains_profit(client):
    client.post(f"{BASE}/transactions", json={"type": "INCOME", "amount_minor": 50_000, "source": "MANUAL"})
    _ask(client, "How business dey go?")
    why = _ask(client, "Why?")
    assert why["intent"] == "profit_why"


def test_unknown_question_with_no_context_stays_honest_help(client):
    d = _ask(client, "abracadabra xyz")
    assert d["intent"] == "help"
    assert "never make figures up" in d["text"]
