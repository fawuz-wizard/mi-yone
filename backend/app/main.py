"""MI YONE backend — FastAPI modular monolith (Phase 2 architecture)."""
import logging
import time
import uuid

from fastapi import FastAPI, Request
from sqlalchemy import text

from .core.db import SessionLocal
from .core.envelope import install_handlers, ok
from .routers import analytics_r, auth, finance_r, integrations_r, parties_r, partner_r, stock_r, trade_r

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

# Pre-Alembic additive shim: bring existing databases up to the current model
# for NEW OPTIONAL columns only (never drops, never rewrites, safe to re-run).
# Real migrations move to Alembic before production deploy (already on the plan).
_ADDITIVE_COLUMNS = (
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entry_method VARCHAR(8) NOT NULL DEFAULT 'manual'",
    "ALTER TABLE debts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ",
    "ALTER TABLE debts ADD COLUMN IF NOT EXISTS entry_method VARCHAR(8) NOT NULL DEFAULT 'manual'",
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ",
    "ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ",
    # Older rows predate the recorded-at column: the honest backfill is the
    # event time itself (we know nothing later than that).
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS origin VARCHAR(12) NOT NULL DEFAULT 'manual'",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS external_id VARCHAR(80)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ",
    "ALTER TABLE catalog_import_items ADD COLUMN IF NOT EXISTS external_id VARCHAR(80)",
    "UPDATE debts SET created_at = since WHERE created_at IS NULL",
    "UPDATE sales SET created_at = occurred_at WHERE created_at IS NULL",
    "UPDATE inventory_movements SET created_at = occurred_at WHERE created_at IS NULL",
)


@app.on_event("startup")
def apply_additive_columns() -> None:
    try:
        with SessionLocal() as db:
            for stmt in _ADDITIVE_COLUMNS:
                db.execute(text(stmt))
            db.commit()
    except Exception:  # fresh/empty database: the seed creates the current schema
        logger.info('{"startup":"additive-columns skipped (no schema yet)"}')


API = "/api/v1"
app.include_router(auth.router, prefix=API)
app.include_router(finance_r.router, prefix=API)
app.include_router(stock_r.router, prefix=API)
app.include_router(parties_r.router, prefix=API)
app.include_router(trade_r.router, prefix=API)
app.include_router(analytics_r.router, prefix=API)
app.include_router(partner_r.router, prefix=API)
app.include_router(integrations_r.router, prefix=API)


@app.get("/health")
def health():
    return ok({"status": "up"})


@app.get("/readiness")
def readiness():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return ok({"status": "ready"})
