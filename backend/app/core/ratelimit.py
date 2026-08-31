"""In-process sliding-window rate limiter (Phase 2 §17).

Good enough for a single-process deployment; swaps for a Redis-backed limiter
when workers scale out (documented seam). Two properties matter for safety:

  * it is BOUNDED. Keys include attacker-supplied text (the identifier typed at
    the sign-in form), and the old version created a permanent entry for every
    key it was ever asked about — unauthenticated memory growth. Empty windows
    are dropped, and the table is capped.
  * it never blocks a legitimate user for longer than its window.
"""
import time
from collections import deque

# Above this many tracked keys, the coldest are dropped. A flood of unique
# identifiers then costs an attacker eviction, not the server's memory.
MAX_KEYS = 10_000

_events: dict[str, deque[float]] = {}


def _prune(key: str, now: float, window_seconds: float) -> deque[float]:
    q = _events.get(key)
    if q is None:
        return deque()
    while q and now - q[0] > window_seconds:
        q.popleft()
    if not q:
        _events.pop(key, None)  # an expired window is not worth remembering
    return q


def allow(key: str, limit: int, window_seconds: float) -> bool:
    return len(_prune(key, time.monotonic(), window_seconds)) < limit


def record(key: str) -> None:
    now = time.monotonic()
    q = _events.get(key)
    if q is None:
        if len(_events) >= MAX_KEYS:
            # Drop the entry whose most recent hit is oldest.
            coldest = min(_events, key=lambda k: _events[k][-1] if _events[k] else 0.0)
            _events.pop(coldest, None)
        q = _events[key] = deque()
    q.append(now)


def reset(key: str) -> None:
    _events.pop(key, None)


def clear_all() -> None:
    """Test hook — wipes limiter state."""
    _events.clear()
