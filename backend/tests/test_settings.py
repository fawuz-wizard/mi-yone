"""Settings center (owner brief): profile edit, business name, password change
with other-session revocation, session listing/sign-out-others, alert
preferences filtering Business Watch, WhatsApp disconnect."""
BASE = "/api/v1/businesses/b-1"


def test_profile_update_and_uniqueness(client):
    r = client.patch("/api/v1/auth/me", json={"name": "Owner Won", "phone": "+232 76 000000"})
    assert r.status_code == 200
    d = r.json()["data"]["user"]
    assert d["name"] == "Owner Won" and d["phone"] == "+232 76 000000"
    # Taking another user's email fails without enumeration detail.
    r = client.patch("/api/v1/auth/me", json={"email": "other@test.sl"})
    assert r.status_code == 422


def test_business_name_update(client):
    r = client.patch(BASE, json={"name": "Won Shop"})
    assert r.status_code == 200
    assert r.json()["data"]["name"] == "Won Shop"
    assert client.get("/api/v1/auth/me").json()["data"]["business"]["name"] == "Won Shop"


def test_change_password_requires_current_and_revokes_other_sessions(client):
    # A second signed-in device.
    from fastapi.testclient import TestClient
    from app.main import app
    other = TestClient(app)
    r = other.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "password-1234"})
    assert r.status_code == 200
    assert other.get(f"{BASE}/watch").status_code == 200

    # Wrong current password → refused.
    r = client.post("/api/v1/auth/change-password", json={"current_password": "wrong-wrong", "new_password": "brand-new-pass-1"})
    assert r.status_code == 422
    # Right current password → changed; the OTHER device is signed out.
    r = client.post("/api/v1/auth/change-password", json={"current_password": "password-1234", "new_password": "brand-new-pass-1"})
    assert r.status_code == 200
    assert other.get(f"{BASE}/watch").status_code == 401
    assert client.get(f"{BASE}/watch").status_code == 200  # this session survives
    # New password works for a fresh sign-in.
    r = other.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "brand-new-pass-1"})
    assert r.status_code == 200


def test_sessions_list_and_sign_out_others(client):
    from fastapi.testclient import TestClient
    from app.main import app
    other = TestClient(app)
    other.post("/api/v1/auth/login", json={"identifier": "owner@test.sl", "password": "password-1234"})

    d = client.get("/api/v1/auth/sessions").json()["data"]["sessions"]
    assert len(d) >= 2
    assert sum(1 for s in d if s["current"]) == 1

    r = client.post("/api/v1/auth/sessions/sign-out-others", json={})
    assert r.json()["data"]["signed_out"] >= 1
    assert other.get(f"{BASE}/watch").status_code == 401
    assert client.get(f"{BASE}/watch").status_code == 200


def test_alert_prefs_silence_categories_without_inventing(client):
    # Create a low-stock product → a stock alert exists.
    client.post(f"{BASE}/products", json={"name": "Candles", "selling_price_minor": 2_000, "initial_stock": 1, "low_stock_threshold": 5})
    alerts = client.get(f"{BASE}/watch").json()["data"]["alerts"]
    assert any(a["id"].startswith("watch-low-stock") for a in alerts)

    # Turn stock alerts off → that alert is silenced; nothing else appears.
    r = client.patch(f"{BASE}/settings/alerts", json={"stock": False, "debts": True, "money": True, "records": True})
    assert r.status_code == 200
    alerts = client.get(f"{BASE}/watch").json()["data"]["alerts"]
    assert not any(a["id"].startswith("watch-low-stock") for a in alerts)

    # Preferences read back.
    prefs = client.get(f"{BASE}/settings/alerts").json()["data"]
    assert prefs["stock"] is False and prefs["debts"] is True


def test_whatsapp_disconnect_keeps_products(client):
    client.post(f"{BASE}/integrations/whatsapp/connect", json={})
    imp = client.post(f"{BASE}/integrations/whatsapp/imports", json={}).json()["data"]
    lux = next(i for i in imp["items"] if "Lux" in i["name"])
    client.post(f"{BASE}/integrations/whatsapp/items/{lux['id']}/approve", json={})
    assert any("Lux" in p["name"] for p in client.get(f"{BASE}/products").json()["data"])

    r = client.request("DELETE", f"{BASE}/integrations/whatsapp/connection")
    assert r.status_code == 200
    # Products stay; the connection is gone (a second disconnect 404s).
    assert any("Lux" in p["name"] for p in client.get(f"{BASE}/products").json()["data"])
    assert client.request("DELETE", f"{BASE}/integrations/whatsapp/connection").status_code == 404


def test_staff_cannot_change_business_settings(staff_client):
    assert staff_client.patch(BASE, json={"name": "Hostile"}).status_code == 403
    assert staff_client.patch(f"{BASE}/settings/alerts", json={"stock": False, "debts": True, "money": True, "records": True}).status_code == 403
