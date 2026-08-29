"""SQLAlchemy models — Phase 2 §4 entity map (v1 scope).
Money = BIGINT minor units. Financial rows are append-only: no UPDATE of
financial fields, no DELETE — corrections are reversal rows (§8)."""
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .core.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Business(Base):
    __tablename__ = "businesses"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3), default="SLE")
    country: Mapped[str] = mapped_column(String(2), default="SL")
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BusinessMember(Base):
    __tablename__ = "business_members"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="OWNER")  # OWNER/ADMIN/STAFF
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    __table_args__ = (UniqueConstraint("business_id", "user_id"),)


class Category(Base):
    __tablename__ = "transaction_categories"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(8))  # INCOME/EXPENSE
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("business_id", "name", "kind"),)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    type: Mapped[str] = mapped_column(String(8))  # INCOME/EXPENSE
    status: Mapped[str] = mapped_column(String(10), default="POSTED")  # POSTED/REVERSED
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="SLE")
    category_name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    recorded_by: Mapped[str] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(12), default="MANUAL")  # MANUAL/SALE/SETTLEMENT
    counterparty_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    reverses_transaction_id: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fixed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fixed_was_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    fixed_now_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_tx_amount_positive"),
        Index("ix_tx_business_occurred", "business_id", "occurred_at"),
        Index("uq_tx_idempotency", "business_id", "idempotency_key", unique=True, postgresql_where=(idempotency_key.isnot(None))),
    )


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(24), default="piece")
    selling_minor: Mapped[int] = mapped_column(BigInteger)
    cost_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5)
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class StockMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    type: Mapped[str] = mapped_column(String(12))  # PURCHASE/SALE/ADJUSTMENT/DAMAGE
    quantity_delta: Mapped[int] = mapped_column(Integer)
    unit_cost_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    recorded_by: Mapped[str] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Party(Base):
    """Customers and suppliers — one table, a kind discriminator."""

    __tablename__ = "parties"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # customer/supplier
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Debt(Base):
    """Receivables ('owes you') and payables ('you owe')."""

    __tablename__ = "debts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # receivable/payable
    counterparty_id: Mapped[str] = mapped_column(ForeignKey("parties.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    settled_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="MANUAL")  # SALE/MANUAL/PURCHASE
    __table_args__ = (CheckConstraint("settled_minor <= amount_minor", name="ck_debt_no_oversettle"),)


class Sale(Base):
    """One row per sale — the truthful basis for sales counts/totals."""

    __tablename__ = "sales"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    total_minor: Mapped[int] = mapped_column(BigInteger)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cash_transaction_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    receivable_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    __table_args__ = (
        Index("uq_sale_idempotency", "business_id", "idempotency_key", unique=True, postgresql_where=(idempotency_key.isnot(None))),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(40))
    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AIMessage(Base):
    """Partner conversation history (Phase 2 AI memory concept #1). One rolling
    thread per business; the Partner is read-only over business records — these
    rows are the ONLY thing it writes."""

    __tablename__ = "ai_messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # "owner" | "partner"
    text: Mapped[str] = mapped_column(Text)
    intent: Mapped[str | None] = mapped_column(String(30), nullable=True)  # provenance
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CatalogConnection(Base):
    """A connected external catalog source (Phase 2 integration layer). The
    provider adapter behind it is isolated — 'test' today, Meta/WhatsApp
    Business API when real credentials are configured."""

    __tablename__ = "catalog_connections"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # "whatsapp"
    mode: Mapped[str] = mapped_column(String(10))  # "test" | "live"
    status: Mapped[str] = mapped_column(String(20), default="CONNECTED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CatalogImport(Base):
    __tablename__ = "catalog_imports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    connection_id: Mapped[str] = mapped_column(ForeignKey("catalog_connections.id"))
    status: Mapped[str] = mapped_column(String(20))  # IMPORTING | IMPORTED | FAILED
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CatalogImportItem(Base):
    """One catalog product awaiting the owner's review. Nothing becomes a real
    MI YONE product until the owner approves it."""

    __tablename__ = "catalog_import_items"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    import_id: Mapped[str] = mapped_column(ForeignKey("catalog_imports.id"), index=True)
    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # None = incomplete
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(80), nullable=True)
    availability: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "in stock" etc.
    status: Mapped[str] = mapped_column(String(20), default="NEEDS_REVIEW")  # NEEDS_REVIEW | APPROVED | SKIPPED
    duplicate_of_product_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(40), nullable=True)  # set on approve
