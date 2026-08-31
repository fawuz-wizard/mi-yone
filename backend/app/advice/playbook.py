"""General business guidance — the ADVISOR lane.

MI YONE answers from three clearly separated kinds of knowledge:

  1. the owner's records      (deterministic, app/services + ai/evidence)
  2. general business guidance (THIS module)
  3. market research           (app/research — live external sources)

Why guidance is its own lane and not "the AI answering from what it knows":
advice like "keep your best sellers in stock" needs no external fact and no
model creativity — it is craft knowledge. Letting a language model improvise it
per request is where invented statistics ("shops that do X sell 30% more")
creep in. So the guidance text is HUMAN-AUTHORED, versioned in
`playbook.json`, reviewable in a pull request, and rendered VERBATIM — no
provider ever rewrites it.

The playbook deliberately contains no prices, percentages, statistics or market
claims. A figure in an MI YONE answer can only come from the owner's records or
from labelled market research with sources. `test_advice.py` enforces this.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).with_name("playbook.json")


@lru_cache(maxsize=1)
def _pack() -> dict:
    return json.loads(_PATH.read_text(encoding="utf-8"))


def version() -> str:
    return str(_pack()["version"])


def topics() -> dict[str, dict]:
    return _pack()["topics"]


def has(topic: str) -> bool:
    return topic in topics()


# Words that point at a guidance topic. Krio and English both arrive here
# already normalized by ai/lang.py, so only canonical tokens are needed.
# Ordered: the more specific topics are declared first, so a tie on one
# keyword resolves to the narrower topic. "increase_sales" is last because it
# is the broadest — it acts as the general fallback.
TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "debt_collection": ("owe", "owes", "owed", "debt", "debts", "collect", "chase"),
    "pricing": ("price", "prices", "pricing", "charge", "expensive", "cheap"),
    "whatsapp_marketing": ("whatsapp", "advertise", "advertising", "marketing", "promote", "promotion", "status"),
    "stock_management": ("stock", "restock", "inventory", "shelf", "supply", "spoil"),
    "reduce_expenses": ("reduce", "cut", "lower", "save", "expenses", "expense", "cost", "costs", "spending"),
    "attract_customers": ("attract", "bring", "customers", "customer", "people", "market"),
    "customer_retention": ("keep", "retain", "loyal", "return", "returning", "again"),
    "new_products": ("add", "new", "product", "products", "line", "stocking"),
    "cash_flow": ("cash", "flow", "afford", "borrow"),
    "record_keeping": ("record", "records", "book", "books", "track", "keeping"),
    "growth": ("grow", "growth", "expand", "expansion", "bigger", "plan", "planning", "strategy", "future"),
    "increase_sales": ("increase", "boost", "improve", "sales", "sell", "selling"),
}

# A few words claim their topic outright — no scoring needed, and no risk of a
# broader topic out-counting them.
DOMINANT_KEYWORDS: dict[str, str] = {
    "whatsapp": "whatsapp_marketing",
    "price": "pricing",
    "prices": "pricing",
    "pricing": "pricing",
    "restock": "stock_management",
    "credit": "debt_collection",
    "spoil": "stock_management",
}

# Question shapes that mean "advise me" rather than "tell me my numbers".
# These are matched against the NORMALIZED question (ai/lang.py has already
# turned Krio into canonical tokens), so "Wetin I fit do?" arrives as
# "what i can do" and "How ah go market me shop?" as "how i will market my shop".
ADVICE_TRIGGERS = (
    "advice", "advise", "suggest", "suggestion", "idea", "ideas", "tip", "tips",
    "strategy", "recommend", "help me", "should i do", "can i do", "i can do",
    "how can i", "how i can", "how do i", "how to", "what do successful",
    "best practice", "best practices", "what works", "i will market",
    "market my", "grow my", "improve my", "better my", "attract",
)


def match_topic(normalized_question: str, fallback: str = "increase_sales") -> str:
    """Pick the guidance topic a question is asking about. Deterministic: the
    topic with the most keyword hits wins; ties resolve by declaration order."""
    words = set("".join(c if c.isalnum() else " " for c in normalized_question.lower()).split())
    for word, topic in DOMINANT_KEYWORDS.items():
        if word in words:
            return topic
    best, best_score = fallback, 0
    for topic, keys in TOPIC_KEYWORDS.items():
        score = len(words & set(keys))
        if score > best_score:
            best, best_score = topic, score
    return best


def guidance(topic: str) -> dict:
    """The verbatim guidance block for a topic."""
    t = topics()[topic]
    return {"topic": topic, "title": t["title"], "practices": list(t["practices"]), "watch_out": t.get("watch_out")}


def render(topic: str) -> str:
    """Guidance as plain text, exactly as written by a human in playbook.json."""
    g = guidance(topic)
    lines = [f"{g['title']}:"]
    lines += [f"• {p}" for p in g["practices"]]
    if g["watch_out"]:
        lines.append(f"Worth remembering: {g['watch_out']}")
    return "\n".join(lines)
