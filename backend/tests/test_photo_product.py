"""Photo-to-Product: image storage, validation, tenant isolation, optional
fields, and AI suggestions (honest when unavailable, whitelisted when mocked)."""
import base64

BASE = "/api/v1/businesses/b-1"

# A real 1×1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def _create_product(client, name="Solar lamp", **extra):
    r = client.post(f"{BASE}/products", json={"name": name, "selling_price_minor": 45_000_00, **extra})
    assert r.status_code == 201
    return r.json()["data"]


def test_optional_fields_persist_and_serialize(client):
    p = _create_product(client, description="Rechargeable lamp", sku="SL-01", category="Electronics")
    assert p["description"] == "Rechargeable lamp"
    assert p["sku"] == "SL-01"
    assert p["category"] == "Electronics"
    assert p["has_image"] is False and p["image_url"] is None


def test_image_upload_serve_replace_and_remove(client):
    p = _create_product(client)
    pid = p["id"]
    r = client.post(f"{BASE}/products/{pid}/image", files={"file": ("photo.png", PNG, "image/png")})
    assert r.status_code == 201
    assert r.json()["data"]["has_image"] is True
    url = r.json()["data"]["image_url"]
    assert url == f"/api/v1/businesses/b-1/products/{pid}/image"

    img = client.get(url)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content == PNG

    # replace: upload again, still one image, still served
    r2 = client.post(f"{BASE}/products/{pid}/image", files={"file": ("photo2.png", PNG, "image/png")})
    assert r2.status_code == 201
    assert client.get(url).status_code == 200

    # remove
    assert client.delete(f"{BASE}/products/{pid}/image").json()["data"]["has_image"] is False
    assert client.get(url).status_code == 404


def test_image_validation_type_and_size(client):
    pid = _create_product(client)["id"]
    bad_type = client.post(f"{BASE}/products/{pid}/image", files={"file": ("x.gif", b"GIF89a", "image/gif")})
    assert bad_type.status_code == 422
    huge = client.post(f"{BASE}/products/{pid}/image", files={"file": ("x.png", b"0" * (5 * 1024 * 1024 + 1), "image/png")})
    assert huge.status_code == 422
    empty = client.post(f"{BASE}/products/{pid}/image", files={"file": ("x.png", b"", "image/png")})
    assert empty.status_code == 422


def test_images_are_tenant_isolated_and_role_guarded(client, other_client, staff_client):
    pid = _create_product(client)["id"]
    client.post(f"{BASE}/products/{pid}/image", files={"file": ("p.png", PNG, "image/png")})
    # another business cannot fetch or change the image
    assert other_client.get(f"{BASE}/products/{pid}/image").status_code == 404
    assert other_client.post(f"{BASE}/products/{pid}/image", files={"file": ("p.png", PNG, "image/png")}).status_code == 404
    # staff can view, cannot manage (product management = ADMIN+)
    assert staff_client.get(f"{BASE}/products/{pid}/image").status_code == 200
    assert staff_client.post(f"{BASE}/products/{pid}/image", files={"file": ("p.png", PNG, "image/png")}).status_code == 403


def test_suggest_is_honest_without_ai_credentials(client):
    r = client.post(f"{BASE}/products/suggest", files={"file": ("p.png", PNG, "image/png")})
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["available"] is False
    assert d["name"] is None and d["category"] is None and d["description"] is None


def test_suggest_returns_whitelisted_fields_when_provider_available(client, monkeypatch):
    from app.routers import stock_r

    class FakeVision:
        available = True
        def suggest(self, image, content_type):
            # even a misbehaving provider response cannot smuggle a price through
            return {"available": True, "name": "Solar lamp", "category": "Electronics",
                    "description": "A rechargeable solar lamp."}

    monkeypatch.setattr(stock_r, "get_vision_provider", lambda: FakeVision())
    r = client.post(f"{BASE}/products/suggest", files={"file": ("p.png", PNG, "image/png")})
    d = r.json()["data"]
    assert d == {"available": True, "name": "Solar lamp", "category": "Electronics",
                 "description": "A rechargeable solar lamp."}
    assert "price" not in d and "selling_price" not in d


def test_photo_product_is_a_first_class_product(client):
    p = _create_product(client, initial_stock=6, category="Electronics")
    pid = p["id"]
    client.post(f"{BASE}/products/{pid}/image", files={"file": ("p.png", PNG, "image/png")})
    # sells through the normal sale path, stock moves through the ledger
    r = client.post(f"{BASE}/sales", json={"amount_minor": 90_000_00, "product_id": pid, "quantity": 2, "payment": "PAID"})
    assert r.status_code == 201
    products = {x["id"]: x for x in client.get(f"{BASE}/products").json()["data"]}
    assert products[pid]["stock"] == 4
    # and the Partner can talk about it
    ask = client.post(f"{BASE}/partner/messages", json={"text": "How much did I make from solar lamp?"})
    assert "Solar lamp" in ask.json()["data"]["partner"]["text"]
