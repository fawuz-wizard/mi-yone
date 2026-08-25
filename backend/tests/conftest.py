import os

os.environ["MIYONE_DATABASE_URL"] = "postgresql+psycopg2://miyone:miyone_dev@localhost:5432/miyone_test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Business, BusinessMember, User  # noqa: E402
from app.services.seed_categories import seed_categories  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        u1 = User(id="u-1", email="owner@test.sl", password_hash=hash_password("password-1234"), full_name="Owner One")
        u2 = User(id="u-2", email="other@test.sl", password_hash=hash_password("password-5678"), full_name="Other Two")
        db.add_all([u1, u2])
        db.add_all([Business(id="b-1", name="Biz One"), Business(id="b-2", name="Biz Two")])
        db.flush()
        db.add_all([
            BusinessMember(id="bm-1", business_id="b-1", user_id="u-1", role="OWNER"),
            BusinessMember(id="bm-2", business_id="b-2", user_id="u-2", role="OWNER"),
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
