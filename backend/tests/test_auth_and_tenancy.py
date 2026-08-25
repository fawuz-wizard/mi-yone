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
