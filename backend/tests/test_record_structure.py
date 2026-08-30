"""Record-structure refinement: every business record carries a unique
reference, event time vs recorded-at time, and honest entry provenance
(manual/text/voice/scan) — using the EXISTING models, no parallel systems."""
from datetime import timedelta

from app.core.db import SessionLocal
from app.models import Debt, Sale, StockMovement, utcnow

BASE = "/api/v1/businesses/b-1"


def _iso_days_ago(days: int) -> str:
    return (utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")


def _cat(client, kind="EXPENSE"):
    return client.get(f"{BASE}/categories?kind={kind}").json()["data"][0]["id"]


def _product(client) -> dict:
    r = client.post(
        f"{BASE}/products",
        json={"name": "Rice (50kg)", "selling_price_minor": 350_000, "cost_price_minor": 300_000, "initial_stock": 20},
    )
    assert r.status_code in (200, 201)
    return r.json()["data"]


def test_transaction_carries_reference_times_and_entry_method(client):
    # Backdated expense entered by voice: event time ≠ recorded time.
    r = client.post(
        f"{BASE}/transactions",
        json={
            "type": "EXPENSE", "amount_minor": 85_000, "source": "MANUAL",
            "occurred_at": _iso_days_ago(1), "category_id": _cat(client),
            "entry_method": "voice",
        },
    )
    assert r.status_code == 201
    t = r.json()["data"]
    assert t["id"].startswith("t")                # unique reference
    assert t["entry_method"] == "voice"           # provenance stored + serialized
    assert t["occurred_at"] != t["created_at"]    # event time vs recorded time
    assert t["occurred_at"] < t["created_at"]     # recorded AFTER it happened


def test_entry_method_defaults_to_manual_and_rejects_garbage(client):
    r = client.post(f"{BASE}/transactions", json={"type": "EXPENSE", "amount_minor": 1_000, "source": "MANUAL"})
    assert r.json()["data"]["entry_method"] == "manual"
    # Unknown methods are rejected by validation, not silently stored.
    r = client.post(
        f"{BASE}/transactions",
        json={"type": "EXPENSE", "amount_minor": 1_000, "source": "MANUAL", "entry_method": "telepathy"},
    )
    assert r.status_code == 422


def test_sale_records_structure_end_to_end(client):
    # Product sale entered from a typed quick entry.
    pid = _product(client)["id"]
    r = client.post(
        f"{BASE}/sales",
        json={"amount_minor": 700_000, "product_id": pid, "quantity": 2, "payment": "PAID", "entry_method": "text"},
        headers={"Idempotency-Key": "rs-sale-1"},
    )
    assert r.status_code == 201
    tx = r.json()["data"]["transaction"]
    assert tx["entry_method"] == "text"
    assert tx["source"] == "SALE"
    with SessionLocal() as db:
        sale = db.query(Sale).filter_by(business_id="b-1").order_by(Sale.created_at.desc()).first()
        assert sale is not None and sale.created_at is not None  # recorded-at stored
        mv = db.query(StockMovement).filter_by(business_id="b-1", product_id=pid, type="SALE").first()
        assert mv is not None and mv.created_at is not None and mv.quantity_delta == -2


def test_debt_carries_recorded_at_and_entry_method(client):
    customers = client.get(f"{BASE}/customers").json()["data"]
    if customers:
        cid = customers[0]["id"]
    else:
        cid = client.post(f"{BASE}/customers", json={"name": "Musa"}).json()["data"]["id"]
    r = client.post(f"{BASE}/receivables", json={"counterparty_id": cid, "amount_minor": 500_000, "entry_method": "text"})
    assert r.status_code in (200, 201)
    with SessionLocal() as db:
        debt = db.query(Debt).filter_by(business_id="b-1", kind="receivable").order_by(Debt.created_at.desc()).first()
        assert debt is not None
        assert debt.entry_method == "text"
        assert debt.created_at is not None


def test_scan_checkout_is_stamped_scan(client):
    pid = _product(client)["id"]
    r = client.post(
        f"{BASE}/sales/checkout",
        json={"items": [{"product_id": pid, "quantity": 1}]},
        headers={"Idempotency-Key": "rs-scan-1"},
    )
    assert r.status_code == 201
    assert r.json()["data"]["transaction"]["entry_method"] == "scan"


def test_totals_stay_server_computed(client):
    # The checkout total ignores anything the client might claim — recompute check.
    p = _product(client)
    r = client.post(
        f"{BASE}/sales/checkout",
        json={"items": [{"product_id": p["id"], "quantity": 3}]},
        headers={"Idempotency-Key": "rs-total-1"},
    )
    assert r.json()["data"]["total"]["amount_minor"] == 3 * p["selling_price"]["amount_minor"]
