"""Catalog providers — the Phase 2 integration layer boundary.

    Integration Layer
        ├── WhatsApp (Meta)   ← this file
        ├── Banks / Payments  ← future
        └── Future providers

MI YONE never talks to an external catalog directly; it talks to a
CatalogProvider. Which provider answers is configuration:

  MIYONE_WA_MODE=test   (default) — a clearly-labeled TEST adapter with sample
                        catalog data. There is NO live WhatsApp connection in
                        this mode and the UI says so. We never fake one.
  MIYONE_WA_MODE=live   — the Meta WhatsApp Business (Graph API) adapter.
                        Requires MIYONE_WA_ACCESS_TOKEN and
                        MIYONE_WA_BUSINESS_ACCOUNT_ID (a WhatsApp Business
                        Account with a product catalog). Until those exist,
                        connecting in live mode fails honestly.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from ..core.config import settings
from ..core.envelope import ApiError


@dataclass
class CatalogItem:
    name: str
    external_id: str | None = None  # Meta product id — the strong re-import key
    description: str | None = None
    price_minor: int | None = None  # None = the catalog did not state a price
    image_url: str | None = None
    category: str | None = None
    sku: str | None = None
    availability: str | None = None


class TestWhatsAppCatalog:
    """TEST adapter — sample data shaped like a real WhatsApp catalog, covering
    the awkward cases on purpose: a likely duplicate of an existing product, an
    item with no price, rich items with SKU/description/image."""

    mode = "test"

    def fetch(self) -> list[CatalogItem]:
        return [
            CatalogItem(
                name="Rice 50kg", description="Imported long-grain rice, 50kg bag",
                price_minor=90_000_00, category="Food", sku="WA-RICE-50",
                availability="in stock", external_id="meta-1001",
                image_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOY5aoAAAJ8AQA2eOIYAAAAAElFTkSuQmCC",
            ),
            CatalogItem(
                name="Palm oil (1L)", description="Locally produced red palm oil",
                price_minor=25_000_00, category="Cooking", sku="WA-PALM-1L",
                availability="in stock", external_id="meta-1002",
                # Deliberately unreachable: exercises the image-failure path —
                # the product must still import cleanly, just without a photo.
                image_url="https://example.invalid/palm-oil.jpg",
            ),
            CatalogItem(
                name="Maggi cubes (pack)", description="Seasoning cubes, pack of 60",
                price_minor=None, category="Cooking", sku="WA-MAGGI-60",  # no price → needs completing
                availability="in stock", external_id="meta-1003",
            ),
            CatalogItem(
                name="Peak milk (tin)", price_minor=12_000_00, category="Food",
                sku="WA-PEAK-TIN", availability="in stock", external_id="meta-1004",
                image_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQrvIGAAGUAOFEZhcvAAAAAElFTkSuQmCC",
            ),
            CatalogItem(
                name="Lux soap", description="Bath soap bar",
                price_minor=2_000_00, category="Household", sku="WA-LUX",
                availability="in stock", external_id="meta-1005",
            ),
        ]


class MetaWhatsAppCatalog:
    """LIVE adapter — Meta WhatsApp Business / Graph API. Runs only with real
    credentials; otherwise it refuses rather than pretending."""

    mode = "live"
    GRAPH = "https://graph.facebook.com/v21.0"

    def __init__(self, access_token: str, business_account_id: str) -> None:
        if not access_token or not business_account_id:
            raise ApiError(
                422, "VALIDATION_ERROR",
                "WhatsApp live mode needs Meta credentials (access token + business account id). "
                "Until they are configured, use the test catalog.",
            )
        self._token = access_token
        self._waba = business_account_id

    def fetch(self) -> list[CatalogItem]:
        headers = {"Authorization": f"Bearer {self._token}"}
        catalogs = httpx.get(
            f"{self.GRAPH}/{self._waba}/owned_product_catalogs", headers=headers, timeout=20.0
        )
        catalogs.raise_for_status()
        data = catalogs.json().get("data", [])
        if not data:
            return []
        catalog_id = data[0]["id"]
        products = httpx.get(
            f"{self.GRAPH}/{catalog_id}/products",
            params={"fields": "id,name,description,price,currency,image_url,category,retailer_id,availability"},
            headers=headers, timeout=30.0,
        )
        products.raise_for_status()
        items: list[CatalogItem] = []
        for p in products.json().get("data", []):
            # Meta returns price as a formatted string like "SLE 90,000.00"
            price_minor = None
            raw = (p.get("price") or "").replace(",", "")
            digits = "".join(c for c in raw if c.isdigit() or c == ".")
            if digits:
                try:
                    price_minor = round(float(digits) * 100)
                except ValueError:
                    price_minor = None
            items.append(
                CatalogItem(
                    external_id=p.get("id"),
                    name=p.get("name") or "Unnamed product",
                    description=p.get("description"),
                    price_minor=price_minor,
                    image_url=p.get("image_url"),
                    category=p.get("category"),
                    sku=p.get("retailer_id"),
                    availability=p.get("availability"),
                )
            )
        return items


def get_catalog_provider() -> TestWhatsAppCatalog | MetaWhatsAppCatalog:
    if settings.wa_mode == "live":
        return MetaWhatsAppCatalog(settings.wa_access_token, settings.wa_business_account_id)
    return TestWhatsAppCatalog()
