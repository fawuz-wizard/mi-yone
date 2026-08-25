"""MI YONE backend — FastAPI modular monolith (Phase 2 architecture)."""
from fastapi import FastAPI
from sqlalchemy import text

from .core.db import SessionLocal
from .core.envelope import install_handlers, ok
from .routers import analytics_r, auth, finance_r, parties_r, stock_r, trade_r

app = FastAPI(title="MI YONE API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
install_handlers(app)

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
