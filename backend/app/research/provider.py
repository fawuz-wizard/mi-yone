"""Market research — the EXTERNAL KNOWLEDGE lane, behind a provider port.

Phase 2 reserved `research/` as a boundary; this is its implementation. The
rules that make it safe to ship:

  * A research answer must carry SOURCES. No sources → no answer. There is no
    code path that produces a market claim without a URL behind it.
  * When no provider is configured, the honest answer is "I can't verify that
    right now" — never a guess, never remembered market knowledge phrased as a
    finding.
  * Research output is never merged into records answers. It is returned as its
    own provenance block and rendered under its own label with the date it was
    fetched.

Providers:
  MIYONE_RESEARCH_PROVIDER=none       (default) — honestly unavailable.
  MIYONE_RESEARCH_PROVIDER=anthropic  — Anthropic Messages API with the
                                        server-side `web_search` tool, which
                                        returns real citations (title + url).
                                        Uses MIYONE_AI_API_KEY.

Adding Tavily/Brave/SerpAPI later = one more class implementing search().
Nothing else in MI YONE changes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from ..core.config import settings

log = logging.getLogger("miyone")


@dataclass
class Source:
    title: str
    url: str
    published: str | None = None

    def as_json(self) -> dict:
        return {"title": self.title, "url": self.url, "published": self.published}


@dataclass
class ResearchResult:
    ok: bool
    summary: str
    sources: list[Source] = field(default_factory=list)
    researched_at: str = ""
    provider: str = "none"

    def as_json(self) -> dict:
        return {
            "ok": self.ok,
            "summary": self.summary,
            "sources": [s.as_json() for s in self.sources],
            "researched_at": self.researched_at,
            "provider": self.provider,
        }


UNAVAILABLE_TEXT = (
    "I can't verify that information right now — market research isn't switched on for this "
    "business yet, and I won't guess at prices or market facts. What I can do is answer from "
    "your own records, or give you general business guidance."
)

NO_SOURCES_TEXT = (
    "I couldn't find a source I trust for that right now. I'd rather tell you that than give you "
    "a number I can't stand behind. Try rephrasing it, or ask me about your own records."
)

FAILED_TEXT = (
    "We couldn't complete this research. Try again in a moment or rephrase the question — "
    "I won't fill the gap with a guess."
)


class UnavailableProvider:
    """Default. Honest about having no external knowledge source."""

    name = "none"
    available = False

    def search(self, query: str, *, context: str | None = None) -> ResearchResult:  # noqa: ARG002
        return ResearchResult(ok=False, summary=UNAVAILABLE_TEXT, provider=self.name)


RESEARCH_SYSTEM_PROMPT = (
    "You are the research assistant inside MI YONE, looking things up for a small-business owner "
    "in Sierra Leone. Search the web and answer ONLY from what the search results actually say. "
    "Hard rules: every factual claim must come from a search result; never state a price, "
    "statistic or market trend that no result supports; if the results do not answer the "
    "question, say plainly that you could not find it. Prefer recent and West-Africa-relevant "
    "sources when the question is about local markets, and say which country or market a figure "
    "refers to — a price from another country is not the owner's market. Keep it under 150 words, "
    "plain language, no jargon, no bullet lists. Mirror the owner's language: reply in English, "
    "Krio, or their mix exactly as they wrote."
)


class AnthropicWebSearchProvider:
    """Anthropic Messages API + the server-side web_search tool.

    Chosen because it returns first-class citations (title + url per claim), so
    the sources block is real rather than reconstructed, and because it needs no
    second vendor account beyond the AI key the Partner already uses.
    """

    name = "anthropic"
    available = True

    # Tool version is pinned deliberately: a silent upgrade could change the
    # response shape this parser depends on.
    TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 4}

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def search(self, query: str, *, context: str | None = None) -> ResearchResult:
        now = datetime.now(timezone.utc).strftime("%d %b %Y")
        prompt = query if not context else f"{query}\n\nContext about this business (do not treat as fact to verify): {context}"
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
                    "max_tokens": 900,
                    "system": RESEARCH_SYSTEM_PROMPT,
                    "tools": [self.TOOL],
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=60.0,
            )
            resp.raise_for_status()
            summary, sources = self._parse(resp.json())
        except Exception as exc:  # noqa: BLE001 — any failure is reported honestly
            log.warning('{"event":"research_failed","provider":"anthropic","error":"%s"}', type(exc).__name__)
            return ResearchResult(ok=False, summary=FAILED_TEXT, researched_at=now, provider=self.name)

        if not sources or not summary:
            # No citation = no claim. This is the rule that keeps research honest.
            return ResearchResult(ok=False, summary=NO_SOURCES_TEXT, researched_at=now, provider=self.name)
        return ResearchResult(ok=True, summary=summary, sources=sources, researched_at=now, provider=self.name)

    @staticmethod
    def _parse(payload: dict) -> tuple[str, list[Source]]:
        """Tolerant parser: text blocks make the summary, web_search_result
        blocks and citations make the sources. Unknown block types are ignored
        rather than crashing the answer."""
        text_parts: list[str] = []
        sources: dict[str, Source] = {}

        def add(url: str | None, title: str | None, published: str | None = None) -> None:
            if not url:
                return
            if url not in sources:
                sources[url] = Source(title=(title or url)[:200], url=url, published=published)
            elif published and not sources[url].published:
                sources[url].published = published

        for block in payload.get("content", []) or []:
            btype = block.get("type")
            if btype == "text":
                if block.get("text"):
                    text_parts.append(block["text"])
                for c in block.get("citations", []) or []:
                    add(c.get("url"), c.get("title"))
            elif btype == "web_search_tool_result":
                content = block.get("content")
                if isinstance(content, dict):  # error shape
                    log.warning('{"event":"research_tool_error","code":"%s"}', content.get("error_code"))
                    continue
                for item in content or []:
                    if item.get("type") == "web_search_result":
                        add(item.get("url"), item.get("title"), item.get("page_age"))
        return "".join(text_parts).strip(), list(sources.values())[:6]


def get_provider() -> UnavailableProvider | AnthropicWebSearchProvider:
    if settings.research_provider == "anthropic" and settings.ai_api_key:
        return AnthropicWebSearchProvider(settings.ai_api_key, settings.research_model)
    return UnavailableProvider()
