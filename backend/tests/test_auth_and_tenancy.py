"""Authorization is the other CRITICAL surface (Phase 2 §29): wrong-tenant
probes must 404; unauthenticated must 401; sessions must actually revoke."""
from fastapi.testclient import TestClient

from app.main import app


def test_unauthenticated_gets_401():
    c = TestClient(app)
    r = c.get("/api/v1/businesses/b-1/transactions")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "AUTH_REQUIRED"


def test_wrong_password_uniform_401():
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "nope"}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"identifier": "ghost@test.sl", "password": "nope"}).status_code == 401


def test_cross_tenant_probe_is_404_never_403(other_client):
    # other_client belongs to b-2; probing b-1 must not confirm b-1 exists.
    for path in [
        "/api/v1/businesses/b-1/transactions",
        "/api/v1/businesses/b-1/products",
        "/api/v1/businesses/b-1/customers",
        "/api/v1/businesses/b-1/analytics/dashboard",
        "/api/v1/businesses/b-1/reports",
    ]:
        r = other_client.get(path)
        assert r.status_code == 404, path
        assert r.json()["error"]["code"] == "TENANT_NOT_FOUND"


def test_cross_tenant_object_access_denied(client, other_client):
    tx_id = client.post(
        "/api/v1/businesses/b-1/transactions", json={"type": "INCOME", "amount_minor": 100_000, "source": "MANUAL"}
    ).json()["data"]["id"]
    # Even knowing the object id + its true business id, the outsider gets 404.
    assert other_client.get(f"/api/v1/businesses/b-1/transactions/{tx_id}").status_code == 404
    # And through their own tenant the foreign object does not resolve.
    assert other_client.get(f"/api/v1/businesses/b-2/transactions/{tx_id}").status_code == 404


def test_logout_revokes_session(client):
    assert client.get("/api/v1/businesses/b-1/transactions").status_code == 200
    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/businesses/b-1/transactions").status_code == 401


# ---------------------------------------------------------------------------
# Setup flow: /auth/register creates an isolated business, signed in at once
# ---------------------------------------------------------------------------

def test_register_creates_isolated_business_and_session():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={
        "name": "Fatmata Kamara", "identifier": "fatmata@test.sl",
        "password": "first-shop-2026", "business_name": "Fatmata's Shop",
    })
    assert r.status_code == 201
    business = r.json()["data"]["business"]
    assert business["name"] == "Fatmata's Shop"
    bid = business["id"]

    # Session started immediately (cookie) — the new business is reachable…
    me = c.get("/api/v1/auth/me")
    assert me.json()["data"]["business"]["id"] == bid
    dash = c.get(f"/api/v1/businesses/{bid}/analytics/dashboard")
    assert dash.status_code == 200
    assert dash.json()["data"]["health"]["money_in"]["amount_minor"] == 0  # empty, not demo data
    # …with seeded categories ready for the first expense
    cats = c.get(f"/api/v1/businesses/{bid}/categories?kind=EXPENSE").json()["data"]
    assert any(cat["name"] == "Transport" for cat in cats)
    # …and no reach into anyone else's business
    assert c.get("/api/v1/businesses/b-1/analytics/dashboard").status_code == 404


def test_register_duplicate_identifier_fails_without_enumeration():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    payload = {"name": "A", "identifier": "dupe@test.sl", "password": "long-enough-pw", "business_name": "Shop A"}
    assert c.post("/api/v1/auth/register", json=payload).status_code == 201
    c2 = TestClient(app)
    r = c2.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 422  # same generic surface as other validation failures


def test_register_rejects_short_password():
    from fastapi.testclient import TestClient
    from app.main import app

    r = TestClient(app).post("/api/v1/auth/register", json={
        "name": "B", "identifier": "b@test.sl", "password": "short", "business_name": "Shop B",
    })
    assert r.status_code == 422
