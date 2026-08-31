"""Partner AI — advisor + market research lanes (owner brief).

The rules these tests defend:
  * Three lanes, never blended: records / guidance / web. Every answer block
    carries its own provenance label.
  * The guidance playbook is HUMAN-authored and contains no figures — a number
    in an MI YONE answer can only come from records or from sourced research.
  * Research without a configured provider is honestly unavailable, never a
    guess, and never carries a source list it doesn't have.
  * Krio advice/research questions route exactly like their English twins.
"""
import re

from app.advice import playbook
from app.ai.evidence import SOURCE_GUIDANCE, SOURCE_NOTE, SOURCE_RECORDS, SOURCE_WEB, route_mode, _tokens
from app.ai.lang import normalize
from app.research import provider as research_provider

BASE = "/api/v1/businesses/b-1"


def _lane(q: str) -> str:
    n = normalize(q)
    return route_mode(n, set(_tokens(n))) or "business"


def _ask(client, text: str, mode: str = "auto") -> dict:
    r = client.post(f"{BASE}/partner/messages", json={"text": text, "mode": mode})
    assert r.status_code == 201, r.text
    return r.json()["data"]["partner"]


def _sources_of(msg: dict) -> set[str]:
    return {b["source"] for b in msg["blocks"]}


# ---------------------------------------------------------------- routing ---

def test_questions_route_to_the_right_knowledge_lane():
    cases = [
        # the owner's own records
        ("How business dey go?", "business"),
        ("Why profit drop?", "business"),
        ("Which product sell pass?", "business"),
        ("Who owe me?", "business"),
        ("What products dey move now?", "business"),
        ("What should I focus on this month?", "business"),
        # general business guidance
        ("How can I attract customers?", "advice"),
        ("What business strategy should I use?", "advice"),
        ("How can I reduce expenses?", "advice"),
        ("How do I use WhatsApp to increase sales?", "advice"),
        ("What do successful shops do?", "advice"),
        ("Wetin I fit do for increase sales?", "advice"),
        ("How ah go market me shop?", "advice"),
        # decisions (records + guidance, weighed)
        ("Should I buy more rice?", "decision"),
        ("Should ah buy more rice?", "decision"),
        ("Should I increase my price?", "decision"),
        # external market research
        ("What is the market price of rice?", "research"),
        ("Research rice market.", "research"),
        ("What products are people buying more?", "research"),
        ("Wetin people dey buy pass now?", "research"),
        ("What are small businesses doing now?", "research"),
    ]
    for q, expected in cases:
        assert _lane(q) == expected, f"{q!r} routed to {_lane(q)}, expected {expected}"


def test_krio_and_english_advice_questions_route_identically():
    pairs = [
        ("Wetin I fit do for increase sales?", "What can I do to increase sales?"),
        ("How ah go market me shop?", "How can I market my shop?"),
        ("Shud ah buy more rice?", "Should I buy more rice?"),
    ]
    for krio, english in pairs:
        assert _lane(krio) == _lane(english), f"{krio!r} != {english!r}"


# --------------------------------------------------------------- guidance ---

def test_playbook_contains_no_figures_prices_or_statistics():
    """The advisory pack is craft knowledge, not market data. If a number ever
    appears here it would be presented as guidance with no source behind it —
    exactly the fabrication this architecture exists to prevent."""
    blob = " ".join(
        " ".join([t["title"], *t["practices"], t.get("watch_out") or ""]) for t in playbook.topics().values()
    )
    assert not re.search(r"\d", blob), "guidance must not contain digits"
    assert not re.search(r"\b(percent|%|Le\b|dollar|price of)\b", blob, re.I)


def test_advice_answer_combines_records_and_guidance_with_separate_labels(client):
    msg = _ask(client, "How can I increase sales?")
    sources = _sources_of(msg)
    assert SOURCE_RECORDS in sources, "advice must stand on the owner's real situation"
    assert SOURCE_GUIDANCE in sources, "advice must include the guidance lane"
    assert SOURCE_WEB not in sources
    assert msg["mode"] == "advice"
    # Guidance text is the playbook verbatim — no model rewrites it.
    guidance = [b["text"] for b in msg["blocks"] if b["source"] == SOURCE_GUIDANCE]
    assert any(playbook.render(playbook.match_topic("how can i increase sales")) == g for g in guidance)


def test_decision_support_weighs_both_sides_and_never_commands(client):
    """A real partner lays out the trade-off and leaves the call to the owner."""
    client.post(f"{BASE}/products", json={
        "name": "Rice (50kg bag)", "selling_price_minor": 350_00,
        "initial_stock": 1, "low_stock_threshold": 5,
    })
    msg = _ask(client, "Should I buy more rice?")
    assert msg["intent"] == "decision"
    assert _sources_of(msg) == {SOURCE_RECORDS, SOURCE_GUIDANCE}
    text = msg["text"].lower()
    assert "weighing it up" in text
    assert "your call" in text or "against that" in text or "no urgency" in text
    # A partner advises; it does not issue orders.
    for order in ("you must ", "you should immediately", "buy now"):
        assert order not in text


def test_decision_without_matching_records_says_what_it_can_and_cannot_weigh(client):
    msg = _ask(client, "Should I expand to a second shop?")
    assert msg["intent"] == "decision"
    assert "only weigh this against what your records actually show" in msg["text"]


# --------------------------------------------------------------- research ---

def test_research_is_honestly_unavailable_without_a_provider(client):
    assert research_provider.get_provider().available is False
    msg = _ask(client, "What is the market price of rice?")
    assert msg["mode"] == "research"
    assert SOURCE_WEB not in _sources_of(msg), "no provider = no web-sourced claim"
    assert "can't verify" in msg["text"].lower()
    # The Partner describing its own limits is a note, never dressed up as
    # guidance or as a finding.
    assert SOURCE_NOTE in _sources_of(msg)
    for block in msg["blocks"]:
        assert not block.get("sources"), "an unavailable answer must not carry sources"


def test_unavailable_research_offers_the_owners_own_records_instead(client):
    msg = _ask(client, "What products are people buying more?")
    assert SOURCE_RECORDS in _sources_of(msg)
    assert "your own shop" in msg["text"]


def test_explicit_web_mode_forces_the_research_lane(client):
    msg = _ask(client, "how is business going", mode="research")
    assert msg["mode"] == "research"


def test_history_reports_research_availability_honestly(client):
    r = client.get(f"{BASE}/partner/messages")
    assert r.status_code == 200
    assert r.json()["data"]["research_available"] is False


def test_business_questions_are_unchanged_and_still_records_only(client):
    msg = _ask(client, "How is my business doing this month?")
    assert msg["mode"] == "business"
    assert _sources_of(msg) == {SOURCE_RECORDS}


def test_research_provider_rejects_a_result_without_sources():
    """The rule that keeps research honest: a summary with no citation is not
    an answer. Parsed straight from a provider payload, no network."""
    p = research_provider.AnthropicWebSearchProvider("test-key", "test-model")
    summary, sources = p._parse({"content": [{"type": "text", "text": "Rice is expensive."}]})
    assert summary and not sources
    payload = {"content": [
        {"type": "web_search_tool_result", "content": [
            {"type": "web_search_result", "url": "https://example.org/a", "title": "Rice report", "page_age": "May 1, 2026"},
        ]},
        {"type": "text", "text": "Prices vary by market.", "citations": [
            {"type": "web_search_result_location", "url": "https://example.org/a", "title": "Rice report"},
        ]},
    ]}
    summary, sources = p._parse(payload)
    assert summary == "Prices vary by market."
    assert [s.url for s in sources] == ["https://example.org/a"]
    assert sources[0].published == "May 1, 2026"


def test_research_provider_survives_a_tool_error_block():
    p = research_provider.AnthropicWebSearchProvider("test-key", "test-model")
    summary, sources = p._parse({"content": [
        {"type": "web_search_tool_result", "content": {"type": "web_search_tool_result_error", "error_code": "max_uses_exceeded"}},
        {"type": "text", "text": "partial"},
    ]})
    assert summary == "partial" and sources == []
