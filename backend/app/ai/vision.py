"""Photo-to-Product AI suggestions — same provider discipline as the Partner.

The vision layer may suggest a NAME, CATEGORY, and DESCRIPTION from a product
photo. It must NEVER suggest or determine a price — the owner provides the
price, always (the request schema has no price field, so a provider cannot
smuggle one in). With no AI credentials configured there are NO suggestions —
we say so honestly rather than faking recognition."""
from __future__ import annotations

import base64
import json
import logging

import httpx

from ..core.config import settings

log = logging.getLogger("miyone")

VISION_PROMPT = (
    "You are helping a small-business owner in Sierra Leone add a product from a photo. "
    "Look at the image and reply with ONLY a JSON object: "
    '{"name": "<short product name, max 60 chars>", "category": "<one or two words>", '
    '"description": "<one plain sentence>"}. '
    "Never include a price, cost, or value of any kind. If you cannot tell what the "
    'product is, reply {"name": null, "category": null, "description": null}.'
)


class NoVision:
    """No credentials → no suggestions. Honest, never fake."""

    available = False

    def suggest(self, image: bytes, content_type: str) -> dict:  # noqa: ARG002
        return {"available": False, "name": None, "category": None, "description": None}


class AnthropicVision:
    available = True

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def suggest(self, image: bytes, content_type: str) -> dict:
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
                    "max_tokens": 300,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": content_type,
                                        "data": base64.b64encode(image).decode(),
                                    },
                                },
                                {"type": "text", "text": VISION_PROMPT},
                            ],
                        }
                    ],
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            text = "".join(b.get("text", "") for b in resp.json().get("content", []) if b.get("type") == "text")
            raw = json.loads(text.strip().removeprefix("```json").removesuffix("```").strip())
            # Whitelist the fields — a price can never pass through, whatever the model says.
            return {
                "available": True,
                "name": (str(raw.get("name"))[:60] if raw.get("name") else None),
                "category": (str(raw.get("category"))[:40] if raw.get("category") else None),
                "description": (str(raw.get("description"))[:200] if raw.get("description") else None),
            }
        except Exception as exc:  # noqa: BLE001 — a failed suggestion is just no suggestion
            log.warning('{"event":"vision_fallback","error":"%s"}', type(exc).__name__)
            return {"available": False, "name": None, "category": None, "description": None}


def get_vision_provider() -> NoVision | AnthropicVision:
    if settings.ai_provider == "anthropic" and settings.ai_api_key:
        return AnthropicVision(settings.ai_api_key, settings.ai_model)
    return NoVision()
