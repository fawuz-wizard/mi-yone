"""WhatsApp catalog import — connect, import, review, approve/skip.

Nothing imported becomes a real MI YONE product until the owner approves it,
and approval goes through the SAME product-creation shape the manual flow uses
(product row + optional opening-stock movement), so stock, analytics, Business
Watch, and the Partner all see an approved import exactly like any product."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..core.envelope import ApiError
from ..integrations.catalog import get_catalog_provider
from ..models import CatalogConnection, CatalogImport, CatalogImportItem, Product
from ..services import inventory
from ..services.finance import audit

UNIT_WORDS = {
    "bag", "bags", "piece", "pieces", "kg", "kilo", "cup", "packet", "bottle",
    "carton", "bar", "bars", "tin", "tins", "box", "pack", "pair", "litre", "liter",
}


def _name_tokens(name: str) -> set[str]:
    words = "".join(c if c.isalnum() else " " for c in name.lower()).split()
    return {w for w in words if len(w) >= 3 and not w[0].isdigit() and w not in UNIT_WORDS}


def get_connection(db: Session, business_id: str) -> CatalogConnection | None:
    return db.scalar(select(CatalogConnection).where(CatalogConnection.business_id == business_id, CatalogConnection.provider == "whatsapp"))


def connect(db: Session, business_id: str, actor: str) -> CatalogConnection:
    existing = get_connection(db, business_id)
    if existing:
        return existing
    provider = get_catalog_provider()  # live mode validates credentials here — no fake connections
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
    for item in catalog_items:
        tokens = _name_tokens(item.name)
        duplicate = next((p for p, pt in product_tokens if tokens & pt), None)
        db.add(
            CatalogImportItem(
                id=gen_id("wait"),
                import_id=imp.id,
                business_id=business_id,
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
    product = Product(
        id=gen_id("p"),
        business_id=business_id,
        name=item.name,
        unit=(unit or "piece").strip() or "piece",
        selling_minor=price,
        cost_minor=cost_price_minor or 0,
        low_stock_threshold=5,
    )
    db.add(product)
    if initial_stock and initial_stock > 0:
        inventory.add_movement(db, business_id, product.id, actor, "PURCHASE", initial_stock, product.cost_minor or None, "Opening stock (WhatsApp import)")
    item.status = "APPROVED"
    item.product_id = product.id
    audit(db, business_id, actor, "catalog.approve", "product", product.id, item.sku)
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
