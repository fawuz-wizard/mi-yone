"""Krio + business-language normalization (AI CONTEXT layer).

Krio is a FIRST-CLASS input language for the Partner: questions are normalized
into canonical business tokens BEFORE intent routing, so "Wetin a spend moni
on?" and "What did I spend money on?" land on the same intent. This is a
configurable vocabulary, not a hard-coded example list — grow it by adding
entries; nothing else changes. Normalization is deterministic text mapping
only: it never adds, removes, or invents business meaning.
"""

# Multi-word expressions first (matched on the lowercased text, longest wins).
# Krio / Sierra Leonean business phrases → canonical tokens the router knows.
PHRASE_MAP: dict[str, str] = {
    "dey go": "doing",
    "de go": "doing",
    "dey do": "doing",
    "de do": "doing",
    "dey waka": "doing",
    "sell pass": "best selling",
    "sel pass": "best selling",
    "sell pas": "best selling",
    "don go down": "decreased",
    "don drop": "dropped",
    "go down": "down",
    "make am": "make it",
    "from am": "from it",
    "pan am": "on it",
    "na how much": "is how much",
    "how much moni": "how much money",
    "owe me": "owes me",
    "get fo pay": "owes",
    "day money": "spending",
}

# Single-token map: Krio spelling / common variants → canonical English token.
TOKEN_MAP: dict[str, str] = {
    "wetin": "what",
    "watin": "what",
    "uden": "who",
    "udat": "who",
    "usai": "where",
    "aw": "how",
    "moni": "money",
    "bisness": "business",
    "bizness": "business",
    "biznes": "business",
    "dis": "this",
    "dat": "that",
    "las": "last",
    "mun": "month",
    "wik": "week",
    "tide": "today",
    "yestade": "yesterday",
    "na": "is",
    "don": "",       # perfective marker — no business meaning
    "dey": "",       # progressive marker
    "de": "",
    "fo": "for",
    "pan": "on",
    "am": "it",
    "ah": "i",
    "a": "i",
    "mi": "my",
    "sel": "sell",
    "buy": "buy",
    "spen": "spend",
    "spend": "spend",
    "profit": "profit",
    "gain": "profit",
    "lef": "left",
    "plenti": "many",
    "smol": "small",
    "pas": "most",
    "tok": "tell",
    "chek": "check",
    "kompia": "compare",
    "kredi": "credit",
    "kredit": "credit",
    "dbt": "debt",
    "custa": "customer",
    "kustoma": "customer",
    "stok": "stock",
    "prodok": "product",
    "prodak": "product",
}


def normalize(text: str) -> str:
    """Lowercase; apply phrase map, then token map. Deterministic, meaning-
    preserving. The output feeds the intent router and nothing else."""
    t = " " + text.lower().strip() + " "
    for phrase, repl in sorted(PHRASE_MAP.items(), key=lambda kv: -len(kv[0])):
        t = t.replace(f" {phrase} ", f" {repl} ").replace(f" {phrase}?", f" {repl}?")
    words = "".join(c if c.isalnum() else " " for c in t).split()
    out = [TOKEN_MAP.get(w, w) for w in words]
    return " ".join(w for w in out if w)
