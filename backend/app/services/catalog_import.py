"""WhatsApp catalog import — connect, import, review, approve/skip.

Nothing imported becomes a real MI YONE product until the owner approves it,
and approval goes through the SAME product-creation shape the manual flow uses
(product row + optional opening-stock movement), so stock, analytics, Business
Watch, and the Partner all see an approved import exactly like any product."""
from sqlalchemy import select
from sqlalchemy.orm import Session

import base64

import httpx

from ..common.ids import gen_id
from ..core import storage
from ..core.envelope import ApiError
from ..integrations.catalog import get_catalog_provider
from ..models import CatalogConnection, CatalogImport, CatalogImportItem, Product
from ..services import inventory
from ..services.finance import audit

# Packaging, unit and filler words say nothing about WHAT a product is.
# Matching on one of them warned that "Palm oil" may already exist as
# "Coconut oil" — a confident, wrong duplicate warning.
UNIT_WORDS = {
    "bag", "bags", "piece", "pieces", "kg", "kilo", "kilos", "cup", "cups",
    "packet", "packets", "bottle", "bottles", "carton", "cartons", "bar",
    "bars", "tin", "tins", "box", "boxes", "pack", "packs", "pair", "litre",
    "liter", "litres", "liters", "sachet", "sachets", "crate", "crates",
    "small", "large", "big", "the",
}


def _name_tokens(name: str) -> set[str]:
    words = "".join(c if c.isalnum() else " " for c in name.lower()).split()
    return {w for w in words if len(w) >= 3 and not w[0].isdigit() and w not in UNIT_WORDS}


def get_connection(db: Session, business_id: str) -> CatalogConnection | None:
    return db.scalar(
        select(CatalogConnection).where(
            CatalogConnection.business_id == business_id,
            CatalogConnection.provider == "whatsapp",
            CatalogConnection.status == "CONNECTED",
        )
    )


def connect(db: Session, business_id: str, actor: str) -> CatalogConnection:
    existing = get_connection(db, business_id)
    if existing:
        return existing
    provider = get_catalog_provider()  # live mode validates credentials here — no fake connections
    # A previously disconnected connection is reactivated, keeping its history.
    dormant = db.scalar(
        select(CatalogConnection).where(
            CatalogConnection.business_id == business_id, CatalogConnection.provider == "whatsapp"
        )
    )
    if dormant is not None:
        dormant.status = "CONNECTED"
        dormant.mode = provider.mode
        audit(db, business_id, actor, "catalog.reconnect", "catalog_connection", dormant.id, provider.mode)
        db.flush()
        return dormant
    conn = CatalogConnection(id=gen_id("wac"), business_id=business_id, provider="whatsapp", mode=provider.mode, status="CONNECTED")
    db.add(conn)
    audit(db, business_id, actor, "catalog.connect", "catalog_connection", conn.id, provider.mode)
    db.flush()
    return conn


def latest_import(db: Session, business_id: str) -> CatalogImport | None:
    return db.scalar(
        select(CatalogImport).where(CatalogImport.business_id == business_id).order_by(CatalogImport.created_at.desc()).limit(1)
    )


def items_of(db: Session, import_id: str) -> list[CatalogImportItem]:
    return list(db.scalars(select(CatalogImportItem).where(CatalogImportItem.import_id == import_id)))


def run_import(db: Session, business_id: str, actor: str) -> CatalogImport:
    conn = get_connection(db, business_id)
    if conn is None:
        raise ApiError(422, "VALIDATION_ERROR", "Connect the WhatsApp catalog first.")
    imp = CatalogImport(id=gen_id("waimp"), business_id=business_id, connection_id=conn.id, status="IMPORTING")
    db.add(imp)
    db.flush()
    try:
        catalog_items = get_catalog_provider().fetch()
    except ApiError:
        raise
    except Exception as exc:  # provider/network failure → honest FAILED state
        imp.status = "FAILED"
        imp.error = f"The catalog could not be fetched ({type(exc).__name__})."
        audit(db, business_id, actor, "catalog.import_failed", "catalog_import", imp.id)
        db.flush()
        return imp

    products = list(db.scalars(select(Product).where(Product.business_id == business_id)))
    product_tokens = [(p, _name_tokens(p.name)) for p in products]
    by_external = {p.external_id: p for p in products if p.external_id}
    for item in catalog_items:
        # Duplicate detection: the external Meta id is the STRONG key (a
        # re-import of the same catalog product); name-token overlap is the
        # weak signal (looks like something you already sell).
        duplicate = by_external.get(item.external_id) if item.external_id else None
        if duplicate is None:
            tokens = _name_tokens(item.name)
            duplicate = next((p for p, pt in product_tokens if tokens & pt), None)
        db.add(
            CatalogImportItem(
                id=gen_id("wait"),
                import_id=imp.id,
                business_id=business_id,
                external_id=item.external_id,
                name=item.name[:120],
                description=item.description,
                price_minor=item.price_minor,
                image_url=item.image_url,
                category=item.category,
                sku=item.sku,
                availability=item.availability,
                status="NEEDS_REVIEW",
                duplicate_of_product_id=duplicate.id if duplicate else None,
            )
        )
    imp.status = "IMPORTED"
    audit(db, business_id, actor, "catalog.import", "catalog_import", imp.id, f"{len(catalog_items)} items")
    db.flush()
    return imp


def _get_item(db: Session, business_id: str, item_id: str) -> CatalogImportItem:
    item = db.scalar(select(CatalogImportItem).where(CatalogImportItem.id == item_id, CatalogImportItem.business_id == business_id))
    if item is None:
        raise ApiError(404, "NOT_FOUND", "Record not found.")
    return item


def _fetch_catalog_image(business_id: str, image_url: str | None) -> str | None:
    """Persist a catalog image through the EXISTING storage layer. data: URIs
    (test adapter) decode locally; http(s) URLs (Meta) download with a short
    timeout. Any failure returns None — the product still imports, honestly
    without a photo, never blocking the import on a picture."""
    if not image_url:
        return None
    try:
        if image_url.startswith("data:"):
            header, _, payload = image_url.partition(",")
            content_type = header[5:].split(";")[0] or "application/octet-stream"
            data = base64.b64decode(payload)
        else:
            resp = httpx.get(image_url, timeout=8.0, follow_redirects=True)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "").split(";")[0]
            data = resp.content
        if content_type not in storage.ALLOWED_TYPES or len(data) > 5 * 1024 * 1024 or not data:
            return None
        return storage.save_image(business_id, data, content_type)
    except Exception:
        return None


def approve_item(
    db: Session, business_id: str, actor: str, item_id: str,
    *, selling_price_minor: int | None, cost_price_minor: int | None, initial_stock: int | None, unit: str | None,
) -> tuple[CatalogImportItem, Product]:
    item = _get_item(db, business_id, item_id)
    if item.status != "NEEDS_REVIEW":
        raise ApiError(409, "CONFLICT", "This item was already reviewed.")
    price = selling_price_minor if selling_price_minor is not None else item.price_minor
    if price is None or price <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "This item has no price — set a selling price to add it.")

    # STRONG duplicate (same Meta product id already imported): approving is an
    # UPDATE of the existing product — price/details refresh, identity kept, no
    # duplicate row. Historical transactions are untouched (prices live on the
    # ledger, never rewritten). Weak name matches still create a new product —
    # the review card warns and the owner decides.
    existing = (
        db.scalar(select(Product).where(Product.business_id == business_id, Product.external_id == item.external_id))
        if item.external_id
        else None
    )
    if existing is not None:
        existing.selling_minor = price
        if cost_price_minor:
            existing.cost_minor = cost_price_minor
        existing.description = item.description or existing.description
        existing.sku = item.sku or existing.sku
        existing.category = item.category or existing.category
        existing.archived = False
        if existing.image_key is None:
            existing.image_key = _fetch_catalog_image(business_id, item.image_url)
        product = existing
        if initial_stock and initial_stock > 0:
            inventory.add_movement(db, business_id, product.id, actor, "PURCHASE", initial_stock, product.cost_minor or None, "Restock (WhatsApp import)")
        audit(db, business_id, actor, "catalog.approve_update", "product", product.id, item.sku)
    else:
        product = Product(
            id=gen_id("p"),
            business_id=business_id,
            name=item.name,
            unit=(unit or "piece").strip() or "piece",
            selling_minor=price,
            cost_minor=cost_price_minor or 0,
            low_stock_threshold=5,
            description=item.description,
            sku=item.sku,
            category=item.category,
            origin="whatsapp",
            external_id=item.external_id,
            image_key=_fetch_catalog_image(business_id, item.image_url),
        )
        db.add(product)
        if initial_stock and initial_stock > 0:
            inventory.add_movement(db, business_id, product.id, actor, "PURCHASE", initial_stock, product.cost_minor or None, "Opening stock (WhatsApp import)")
        audit(db, business_id, actor, "catalog.approve", "product", product.id, item.sku)
    item.status = "APPROVED"
    item.product_id = product.id
    db.flush()
    return item, product


def skip_item(db: Session, business_id: str, actor: str, item_id: str) -> CatalogImportItem:
    item = _get_item(db, business_id, item_id)
    if item.status != "NEEDS_REVIEW":
        raise ApiError(409, "CONFLICT", "This item was already reviewed.")
    item.status = "SKIPPED"
    audit(db, business_id, actor, "catalog.skip", "catalog_import_item", item.id)
    db.flush()
    return item
