"""WhatsApp catalog import — functional testing-stage flow (owner brief):
full mapping into the existing product structure, image persistence through
the existing storage layer, provenance, strong-key duplicate handling on
re-import, and honest failure on unreachable images. Runs entirely on the
clearly-labeled TEST adapter — no live connection is ever faked."""
from app.core.db import SessionLocal
from app.models import Product

BASE = "/api/v1/businesses/b-1"


def _connect_and_import(client) -> dict:
    r = client.post(f"{BASE}/integrations/whatsapp/connect", json={})
    assert r.status_code in (200, 201)
    r = client.post(f"{BASE}/integrations/whatsapp/imports", json={})
    assert r.status_code in (200, 201)
    imp = r.json()["data"]
    assert imp["status"] == "IMPORTED"
    return imp


def _item(imp: dict, name_part: str) -> dict:
    return next(i for i in imp["items"] if name_part in i["name"])


def test_import_maps_everything_into_the_existing_product_structure(client):
    imp = _connect_and_import(client)
    assert len(imp["items"]) == 5  # products found

    rice = _item(imp, "Rice 50kg")
    r = client.post(f"{BASE}/integrations/whatsapp/items/{rice['id']}/approve", json={"initial_stock": 10})
    assert r.status_code in (200, 201)

    products = client.get(f"{BASE}/products").json()["data"]
    p = next(x for x in products if x["name"] == "Rice 50kg")
    assert p["description"] == "Imported long-grain rice, 50kg bag"
    assert p["sku"] == "WA-RICE-50"
    assert p["category"] == "Food"
    assert p["origin"] == "whatsapp"          # auditability: WhatsApp-imported
    assert p["selling_price"]["amount_minor"] == 90_000_00
    assert p["stock"] == 10
    # The catalog image (data URI in the test adapter) persisted through the
    # EXISTING storage layer and serves from the normal image route.
    assert p["has_image"] is True
    img = client.get(p["image_url"])
    assert img.status_code == 200 and img.headers["content-type"].startswith("image/")
    with SessionLocal() as db:
        row = db.get(Product, p["id"])
        assert row.external_id == "meta-1001"  # Meta product id retained
        assert row.created_at is not None       # import timestamp


def test_unreachable_image_never_blocks_the_import(client):
    imp = _connect_and_import(client)
    palm = _item(imp, "Palm oil")
    r = client.post(f"{BASE}/integrations/whatsapp/items/{palm['id']}/approve", json={})
    assert r.status_code in (200, 201)
    p = next(x for x in client.get(f"{BASE}/products").json()["data"] if "Palm oil" in x["name"])
    assert p["origin"] == "whatsapp"
    assert p["has_image"] is False  # honest: no photo, but the product imported


def test_missing_price_requires_the_owner_not_a_guess(client):
    imp = _connect_and_import(client)
    maggi = _item(imp, "Maggi")
    r = client.post(f"{BASE}/integrations/whatsapp/items/{maggi['id']}/approve", json={})
    assert r.status_code == 422  # no price in the catalog → owner must set one
    r = client.post(f"{BASE}/integrations/whatsapp/items/{maggi['id']}/approve", json={"selling_price_minor": 3_000_00})
    assert r.status_code in (200, 201)


def test_reimport_matches_by_meta_id_and_updates_instead_of_duplicating(client):
    imp = _connect_and_import(client)
    rice = _item(imp, "Rice 50kg")
    client.post(f"{BASE}/integrations/whatsapp/items/{rice['id']}/approve", json={})
    first = next(x for x in client.get(f"{BASE}/products").json()["data"] if x["name"] == "Rice 50kg")

    # Second import of the same catalog: the item is flagged as an existing
    # product (strong Meta-id match) and approving UPDATES it in place.
    imp2 = _connect_and_import(client)
    rice2 = _item(imp2, "Rice 50kg")
    assert rice2["duplicate_of_product_id"] == first["id"]
    r = client.post(f"{BASE}/integrations/whatsapp/items/{rice2['id']}/approve", json={})
    assert r.status_code in (200, 201)

    products = [x for x in client.get(f"{BASE}/products").json()["data"] if x["name"] == "Rice 50kg"]
    assert len(products) == 1                      # no duplicate row
    assert products[0]["id"] == first["id"]        # same identity, refreshed


def test_manual_and_photo_products_keep_their_own_provenance(client):
    r = client.post(f"{BASE}/products", json={"name": "Broom", "selling_price_minor": 5_000})
    assert r.json()["data"]["origin"] == "manual"
    r = client.post(f"{BASE}/products", json={"name": "Basket", "selling_price_minor": 8_000, "origin": "photo"})
    assert r.json()["data"]["origin"] == "photo"
    # "whatsapp" can never be claimed by a client — only the import stamps it.
    r = client.post(f"{BASE}/products", json={"name": "Fake", "selling_price_minor": 1_000, "origin": "whatsapp"})
    assert r.status_code == 422
