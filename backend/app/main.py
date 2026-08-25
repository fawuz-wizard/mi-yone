"""MI YONE backend — FastAPI modular monolith (Phase 2 architecture)."""
import logging
import time
import uuid

from fastapi import FastAPI, Request
from sqlalchemy import text

from .core.db import SessionLocal
from .core.envelope import install_handlers, ok
from .routers import analytics_r, auth, finance_r, parties_r, stock_r, trade_r

logger = logging.getLogger("miyone")
logging.basicConfig(level=logging.INFO, format="%(message)s")

app = FastAPI(title="MI YONE API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
install_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Request-id + structured log line + security headers on every response."""
    request_id = f"req-{uuid.uuid4().hex[:10]}"
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    # Structured log: never bodies, never tokens, never financial detail (Phase 2 §26).
    logger.info(
        '{"request_id":"%s","method":"%s","path":"%s","status":%d,"ms":%s}',
        request_id, request.method, request.url.path, response.status_code, duration_ms,
    )
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"  # financial responses are never cached
    return response

API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(finance_r.router, prefix=API)
app.include_router(stock_r.router, prefix=API)
app.include_router(parties_r.router, prefix=API)
app.include_router(trade_r.router, prefix=API)
app.include_router(analytics_r.router, prefix=API)


@app.get("/health")
def health():
    return ok({"status": "up"})


@app.get("/readiness")
def readiness():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return ok({"status": "ready"})
