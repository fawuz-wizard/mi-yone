import os

os.environ["MIYONE_DATABASE_URL"] = "postgresql+psycopg2://miyone:miyone_dev@localhost:5432/miyone_test"

import subprocess  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Business, BusinessMember, User  # noqa: E402
from app.services.seed_categories import seed_categories  # noqa: E402


BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def migrated_schema():
    """The test database is built ONCE per session by `alembic upgrade head` —
    the same path production uses — never by create_all. Every test therefore
    runs against the migrated schema, and a migration that drifts from the
    models fails the suite instead of passing silently."""
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, check=True)
    yield


def _truncate_all() -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.exec_driver_sql(f"TRUNCATE TABLE {tables} CASCADE")


@pytest.fixture(autouse=True)
def fresh_db(migrated_schema):
    from app.core import ratelimit

    ratelimit.clear_all()
    _truncate_all()
    with SessionLocal() as db:
        u1 = User(id="u-1", email="owner@test.sl", password_hash=hash_password("password-1234"), full_name="Owner One")
        u2 = User(id="u-2", email="other@test.sl", password_hash=hash_password("password-5678"), full_name="Other Two")
        u3 = User(id="u-3", email="staff@test.sl", password_hash=hash_password("password-9012"), full_name="Staff Three")
        db.add_all([u1, u2, u3])
        db.add_all([Business(id="b-1", name="Biz One"), Business(id="b-2", name="Biz Two")])
        db.flush()
        db.add_all([
            BusinessMember(id="bm-1", business_id="b-1", user_id="u-1", role="OWNER"),
            BusinessMember(id="bm-2", business_id="b-2", user_id="u-2", role="OWNER"),
            BusinessMember(id="bm-3", business_id="b-1", user_id="u-3", role="STAFF"),
        ])
        seed_categories(db, "b-1")
        seed_categories(db, "b-2")
        db.commit()
    yield
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


@pytest.fixture()
def client():
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "password-1234"})
    assert r.status_code == 200
    return c


@pytest.fixture()
def other_client():
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"identifier": "other@test.sl", "password": "password-5678"})
    assert r.status_code == 200
    return c


@pytest.fixture()
def staff_client():
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"identifier": "staff@test.sl", "password": "password-9012"})
    assert r.status_code == 200
    return c
