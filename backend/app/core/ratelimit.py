"""In-process sliding-window rate limiter (Phase 2 §17).
Good enough for a single-process deployment; swaps for a Redis-backed limiter
when workers scale out (documented seam)."""
import time
from collections import defaultdict, deque

_events: dict[str, deque[float]] = defaultdict(deque)


def allow(key: str, limit: int, window_seconds: float) -> bool:
    now = time.monotonic()
    q = _events[key]
    while q and now - q[0] > window_seconds:
        q.popleft()
    if len(q) >= limit:
        return False
    return True


def record(key: str) -> None:
    _events[key].append(time.monotonic())


def reset(key: str) -> None:
    _events.pop(key, None)


def clear_all() -> None:
    """Test hook — wipes limiter state."""
    _events.clear()
