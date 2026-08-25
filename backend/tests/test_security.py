"""Adversarial security suite (Phase 2 §16–§18, §29):
role enforcement, injection-as-data, bounds, rate limiting, cookie/header posture."""
from fastapi.testclient import TestClient

from app.main import app


def _tx(client, amount=1_000_00):
    return client.post(
        "/api/v1/businesses/b-1/transactions", json={"type": "INCOME", "amount_minor": amount, "source": "MANUAL"}
    ).json()["data"]


# ---------- Authorization: roles are enforced on the BACKEND ----------

def test_staff_can_record_but_not_correct_or_manage(client, staff_client):
    tx_id = _tx(staff_client)["id"]  # STAFF records — allowed
    # STAFF cannot fix, reverse, create/edit products, or edit/archive people.
    assert staff_client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/fix", json={"amount_minor": 5_000_00, "reason": "x"}).status_code == 403
    assert staff_client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/reverse").status_code == 403
    assert staff_client.post("/api/v1/businesses/b-1/products", json={"name": "X", "selling_price_minor": 1000}).status_code == 403
    cid = staff_client.post("/api/v1/businesses/b-1/customers", json={"name": "Walkin"}).json()["data"]["id"]  # creation = recording, allowed
    assert staff_client.patch(f"/api/v1/businesses/b-1/customers/{cid}", json={"archived": True}).status_code == 403
    # The ADMIN+ path still works.
    assert client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/reverse").status_code == 200
    body = staff_client.post(f"/api/v1/businesses/b-1/transactions/{tx_id}/fix", json={"reason": "x"}).json()
    assert body["error"]["code"] == "PERMISSION_DENIED"


# ---------- Input validation: bounds and injection-as-data ----------

def test_sql_injection_strings_are_inert_data(client):
    evil = "'; DROP TABLE transactions; --"
    r = client.post("/api/v1/businesses/b-1/customers", json={"name": evil})
    assert r.status_code == 201
    assert r.json()["data"]["name"] == evil  # stored verbatim via parameterized SQL
    # The ledger still works afterwards — nothing was executed.
    assert client.get("/api/v1/businesses/b-1/transactions").status_code == 200


def test_xss_payload_is_returned_as_json_data_only(client):
    payload = "<script>alert(1)</script>"
    t = client.post(
        "/api/v1/businesses/b-1/transactions",
        json={"type": "EXPENSE", "amount_minor": 1_000_00, "description": payload, "source": "MANUAL"},
    )
    assert t.status_code == 201
    assert t.json()["data"]["description"] == payload
    assert t.headers["content-type"].startswith("application/json")  # never rendered as HTML by the API


def test_field_bounds_rejected(client):
    long_name = "x" * 500
    assert client.post("/api/v1/businesses/b-1/customers", json={"name": long_name}).status_code == 422
    assert client.post("/api/v1/businesses/b-1/transactions", json={"type": "INCOME", "amount_minor": 10**14, "source": "MANUAL"}).status_code == 422
    assert client.post("/api/v1/businesses/b-1/transactions", json={"type": "WEIRD", "amount_minor": 100, "source": "MANUAL"}).status_code == 422
    assert client.post("/api/v1/businesses/b-1/transactions", json={"type": "INCOME", "amount_minor": 12.5, "source": "MANUAL"}).status_code == 422
    huge_key = "k" * 300
    r = client.post(
        "/api/v1/businesses/b-1/transactions",
        json={"type": "INCOME", "amount_minor": 100, "source": "MANUAL"},
        headers={"Idempotency-Key": huge_key},
    )
    assert r.status_code == 422


def test_future_backdating_is_clamped(client):
    r = client.post(
        "/api/v1/businesses/b-1/transactions",
        json={"type": "INCOME", "amount_minor": 100_00, "occurred_at": "2099-01-01T00:00:00Z", "source": "MANUAL"},
    )
    assert r.status_code == 201
    assert not r.json()["data"]["occurred_at"].startswith("2099")


# ---------- Error handling: structured, never leaky ----------

def test_errors_are_enveloped_with_request_ids_and_no_internals(client):
    r = client.get("/api/v1/businesses/b-1/transactions/does-not-exist")
    body = r.json()
    assert r.status_code == 404 and body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
    assert "request_id" in body["error"]
    text = r.text.lower()
    assert "traceback" not in text and "sqlalchemy" not in text and "psycopg" not in text


def test_security_headers_and_no_store(client):
    r = client.get("/api/v1/businesses/b-1/transactions")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-request-id"].startswith("req-")


def test_session_cookie_flags():
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "password-1234"})
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie and "path=/" in set_cookie


# ---------- Rate limiting ----------

def test_login_rate_limit_locks_repeated_failures():
    c = TestClient(app)
    for _ in range(5):
        assert c.post("/api/v1/auth/login", json={"identifier": "victim@test.sl", "password": "wrong"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"identifier": "victim@test.sl", "password": "wrong"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "RATE_LIMITED"
