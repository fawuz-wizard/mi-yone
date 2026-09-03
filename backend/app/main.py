"""MI YONE backend — FastAPI modular monolith (Phase 2 architecture)."""
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .core import schema
from .core.config import settings
from .core.db import engine
from .core.envelope import install_handlers, ok
from .routers import analytics_r, auth, finance_r, integrations_r, parties_r, partner_r, settings_r, stock_r, trade_r

logger = logging.getLogger("miyone")
# One line per event, timestamp + level first so a platform log viewer can
# filter on them; the message itself stays a compact JSON object. Never bodies,
# never tokens, never financial detail (Phase 2 §26).
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup: report the schema version. The schema is created and changed
    ONLY by `alembic upgrade head` — the application never alters it. If the
    database is behind, the process still starts (so its logs are visible)
    but /readiness answers 503 until a migration is applied."""
    try:
        with engine.connect() as conn:
            st = schema.status(conn)
        if st.at_head:
            logger.info('{"startup":"schema","revision":"%s","at_head":true}', st.current)
        else:
            logger.error(
                '{"startup":"schema","revision":"%s","expected":"%s","at_head":false,'
                '"action":"run: alembic upgrade head"}', st.current, st.head,
            )
    except Exception as exc:  # noqa: BLE001 — a dead database at boot is reported, not hidden
        logger.error('{"startup":"schema","error":"%s"}', type(exc).__name__)
    yield


# The interactive docs map every endpoint and schema. Useful in development,
# an invitation outside it.
_docs = settings.env == "dev"
app = FastAPI(
    title="MI YONE API",
    version="0.1.0",
    docs_url="/api/docs" if _docs else None,
    openapi_url="/api/openapi.json" if _docs else None,
    lifespan=lifespan,
)
install_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Request-id + structured log line + security headers on every response.

    The id is minted BEFORE the handler runs and stored on request.state, so an
    error envelope carries the same id as the log line — a tester's screenshot
    of "request_id: req-…" leads straight to the server log."""
    request_id = f"req-{uuid.uuid4().hex[:10]}"
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
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
app.include_router(partner_r.router, prefix=API)
app.include_router(integrations_r.router, prefix=API)
app.include_router(settings_r.router, prefix=API)


# --- Liveness / readiness -----------------------------------------------------
# /health: the process is up (platform liveness).
# /readiness: the process can serve — database reachable AND schema at the
#   migration head. 503 otherwise, so the platform never routes traffic to a
#   deploy whose migration has not been applied.
# /api/v1/system/readiness: the same check reachable through the public
#   hostname and the frontend proxy, so one URL proves browser → Next → API → DB.


@app.get("/health")
def health():
    return ok({"status": "up"})


def _readiness() -> JSONResponse:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            st = schema.status(conn)
    except Exception as exc:  # noqa: BLE001
        logger.error('{"readiness":"database_unreachable","error":"%s"}', type(exc).__name__)
        return JSONResponse({"success": False, "data": {"status": "not-ready", "reason": "database"}}, status_code=503)
    if not st.at_head:
        logger.error('{"readiness":"schema_behind","revision":"%s","expected":"%s"}', st.current, st.head)
        return JSONResponse(
            {"success": False, "data": {"status": "not-ready", "reason": "schema", "revision": st.current, "expected": st.head}},
            status_code=503,
        )
    return ok({"status": "ready", "revision": st.current})


@app.get("/readiness")
def readiness():
    return _readiness()


@app.get(f"{API}/system/readiness")
def system_readiness():
    return _readiness()
