"""Partner AI providers — the EXPLANATION layer, swappable by configuration.

The provider's only job is phrasing: it receives the grounded fact sentences
from evidence.py and turns them into one reply. It is handed no other business
data, so no provider can invent figures the records don't contain.

  MIYONE_AI_PROVIDER=local      (default) — built-in deterministic composer;
                                 works with no credentials, zero fabrication.
  MIYONE_AI_PROVIDER=anthropic  — phrases the same facts through the Anthropic
                                 API. Requires MIYONE_AI_API_KEY. Falls back to
                                 the local composer on any error, so the owner
                                 always gets a grounded answer.

Adding another vendor later = one new class + the env switch. Nothing else in
MI YONE changes (Phase 2: never couple the product to one AI vendor).
"""
from __future__ import annotations

import logging

import httpx

from ..core.config import settings

log = logging.getLogger("miyone")

SYSTEM_PROMPT = (
    "You are Partner, the business companion inside MI YONE, speaking to a small-business owner in Sierra Leone. "
    "You are given VERIFIED FACTS computed from the owner's own records. Rules you must never break: "
    "use ONLY the numbers and statements in the facts; never invent, estimate, or extrapolate figures; "
    "if the facts say information is missing or insufficient, say so plainly; "
    "keep the reply under 120 words, warm and plain — no jargon, no bullet lists unless the facts contain them; "
    "mirror the owner's language — reply in English, Krio, or their mix exactly as they wrote, keeping every figure verbatim as given in the facts."
)


class LocalComposer:
    """Deterministic built-in explainer — renders the facts directly."""

    name = "local"

    def compose(self, question: str, facts: list[str]) -> str:  # noqa: ARG002
        return "\n\n".join(facts)


class AnthropicProvider:
    """Phrases the grounded facts via the Anthropic Messages API."""

    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._fallback = LocalComposer()

    def compose(self, question: str, facts: list[str]) -> str:
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": 400,
                    "system": SYSTEM_PROMPT,
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                f"The owner asked: {question}\n\nVERIFIED FACTS from their records:\n"
                                + "\n".join(f"- {f}" for f in facts)
                                + "\n\nReply to the owner using only these facts."
                            ),
                        }
                    ],
                },
                timeout=20.0,
            )
            resp.raise_for_status()
            blocks = resp.json().get("content", [])
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
            if text:
                return text
            raise ValueError("empty completion")
        except Exception as exc:  # noqa: BLE001 — any provider failure → grounded fallback
            log.warning('{"event":"ai_provider_fallback","provider":"anthropic","error":"%s"}', type(exc).__name__)
            return self._fallback.compose(question, facts)


def get_provider() -> LocalComposer | AnthropicProvider:
    if settings.ai_provider == "anthropic" and settings.ai_api_key:
        return AnthropicProvider(settings.ai_api_key, settings.ai_model)
    return LocalComposer()
