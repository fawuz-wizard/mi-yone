"""Deployment-readiness guarantees (Phase 6): migrations, readiness, error
correlation, seed safety. These are the tests that let a deploy be trusted."""
import logging
import subprocess
import sys

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from app.core import schema
from app.core.config import settings
from app.core.db import Base, engine
from app.main import app
from app import seed
from tests.conftest import BACKEND_DIR


# --- Migrations ---------------------------------------------------------------


def test_database_is_at_migration_head():
    with engine.connect() as conn:
        st = schema.status(conn)
    assert st.current == st.head == "0001"


def test_models_and_migrations_have_not_drifted():
    """`alembic check` autogenerates against the live (migrated) database and
    fails if models.py describes anything the migrations do not create."""
    r = subprocess.run([sys.executable, "-m", "alembic", "check"], cwd=BACKEND_DIR, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "No new upgrade operations detected" in r.stdout + r.stderr


def test_migration_creates_every_model_table():
    names = set(inspect(engine).get_table_names())
    expected = {t.name for t in Base.metadata.sorted_tables}
    assert expected <= names
    assert "alembic_version" in names


@pytest.mark.parametrize("table,index", [
    ("transactions", "uq_tx_idempotency"),
    ("sales", "uq_sale_idempotency"),
    ("inventory_movements", "uq_movement_idempotency"),
    ("debts", "uq_debt_idempotency"),
])
def test_idempotency_unique_indexes_exist_on_every_ledger(table, index):
    idx = {i["name"]: i for i in inspect(engine).get_indexes(table)}
    assert index in idx and idx[index]["unique"]


def test_duplicate_idempotency_key_is_refused_by_the_database():
    """Belt and braces: even if application-level replay is bypassed, the
    database will not hold two purchases with one key."""
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO businesses (id,name,currency,country,status,created_at) VALUES ('b-x','X','SLE','SL','ACTIVE',now())"))
        conn.execute(text(
            "INSERT INTO products (id,business_id,name,unit,selling_minor,cost_minor,low_stock_threshold,track_inventory,archived,origin,created_at)"
            " VALUES ('p-x','b-x','P','piece',1,1,1,true,false,'manual',now())"
        ))
        conn.execute(text(
            "INSERT INTO inventory_movements (id,business_id,product_id,type,status,idempotency_key,quantity_delta,occurred_at,created_at,recorded_by)"
            " VALUES ('mv-1','b-x','p-x','PURCHASE','POSTED','k1',1,now(),now(),'t')"
        ))
    with pytest.raises(Exception) as e, engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO inventory_movements (id,business_id,product_id,type,status,idempotency_key,quantity_delta,occurred_at,created_at,recorded_by)"
            " VALUES ('mv-2','b-x','p-x','PURCHASE','POSTED','k1',1,now(),now(),'t')"
        ))
    assert "uq_movement_idempotency" in str(e.value)


# --- Readiness ----------------------------------------------------------------


def test_readiness_ok_at_head():
    c = TestClient(app)
    for path in ("/readiness", "/api/v1/system/readiness"):
        r = c.get(path)
        assert r.status_code == 200, path
        assert r.json()["data"] == {"status": "ready", "revision": "0001"}
    assert c.get("/health").json()["data"] == {"status": "up"}


def test_readiness_503_when_schema_behind():
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE alembic_version RENAME TO alembic_version_hidden")
    try:
        r = TestClient(app).get("/api/v1/system/readiness")
        assert r.status_code == 503
        assert r.json()["data"]["reason"] == "schema"
        assert r.json()["data"]["expected"] == "0001"
    finally:
        with engine.begin() as conn:
            conn.exec_driver_sql("ALTER TABLE alembic_version_hidden RENAME TO alembic_version")


def test_readiness_503_when_database_unreachable(monkeypatch):
    from sqlalchemy import create_engine
    from app import main as main_module

    dead = create_engine("postgresql+psycopg2://miyone:miyone_dev@localhost:1/nope", connect_args={"connect_timeout": 1})
    monkeypatch.setattr(main_module, "engine", dead)
    r = TestClient(app).get("/readiness")
    assert r.status_code == 503
    assert r.json()["data"]["reason"] == "database"


# --- Error handling / logging -------------------------------------------------


def test_unhandled_error_is_logged_with_the_request_id_the_user_sees(caplog):
    boom = APIRouter()

    @boom.get("/api/v1/_boom")
    def _boom():
        raise RuntimeError("deliberate")

    app.include_router(boom)
    try:
        with caplog.at_level(logging.ERROR, logger="miyone"):
            r = TestClient(app, raise_server_exceptions=False).get("/api/v1/_boom")
    finally:
        app.router.routes[:] = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/api/v1/_boom"]
    assert r.status_code == 500
    body = r.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "deliberate" not in r.text  # never leak internals
    rid = body["error"]["request_id"]
    logged = [rec for rec in caplog.records if "unhandled_error" in rec.getMessage()]
    assert logged, "the 500 must be logged"
    assert rid in logged[0].getMessage()
    assert logged[0].exc_info is not None  # full traceback in the server log


def test_error_envelope_request_id_matches_response_header():
    r = TestClient(app).get("/api/v1/businesses/nope/products")
    assert r.status_code == 401
    assert r.json()["error"]["request_id"] == r.headers["x-request-id"]


# --- Seed safety --------------------------------------------------------------


def test_seed_refuses_without_the_explicit_flag():
    with pytest.raises(SystemExit) as e:
        seed.guard([])
    assert "Refusing to seed" in str(e.value)


def test_seed_refuses_outside_disposable_environments(monkeypatch):
    monkeypatch.setattr(settings, "env", "production")
    with pytest.raises(SystemExit) as e:
        seed.guard([seed.SEED_FLAG])
    assert "never seeded" in str(e.value)


def test_seed_allowed_only_in_dev_or_demo_with_flag(monkeypatch):
    for env in ("dev", "demo"):
        monkeypatch.setattr(settings, "env", env)
        seed.guard([seed.SEED_FLAG])  # no exit
