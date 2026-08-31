"""Krio + business-language normalization (AI CONTEXT layer).

Krio is a FIRST-CLASS input language for the Partner: questions are normalized
into canonical business tokens BEFORE intent routing, so "Wetin a spend moni
on?" and "What did I spend money on?" land on the same intent. This is a
configurable vocabulary, not a hard-coded example list — grow it by editing
`lang.json`; nothing else changes. Normalization is deterministic text mapping
only: it never adds, removes, or invents business meaning.

The vocabulary lives in JSON because the in-repo mock needs exactly the same
one: `frontend/src/mocks/lang.json` is a copy, and a test fails the build if
the two ever drift apart. One vocabulary, two runtimes.
"""
import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).with_name("lang.json")


@lru_cache(maxsize=1)
def _pack() -> dict:
    return json.loads(_PATH.read_text(encoding="utf-8"))

# Multi-word expressions first (matched on the lowercased text, longest wins).
# Krio / Sierra Leonean business phrases → canonical tokens the router knows.
PHRASE_MAP: dict[str, str] = _pack()["phrases"]

# Single-token map: Krio spelling / common variants → canonical English token.
TOKEN_MAP: dict[str, str] = _pack()["tokens"]


def normalize(text: str) -> str:
    """Lowercase; apply phrase map, then token map. Deterministic, meaning-
    preserving. The output feeds the intent router and nothing else."""
    t = " " + text.lower().strip() + " "
    for phrase, repl in sorted(PHRASE_MAP.items(), key=lambda kv: -len(kv[0])):
        t = t.replace(f" {phrase} ", f" {repl} ").replace(f" {phrase}?", f" {repl}?")
    words = "".join(c if c.isalnum() else " " for c in t).split()
    out = [TOKEN_MAP.get(w, w) for w in words]
    return " ".join(w for w in out if w)
