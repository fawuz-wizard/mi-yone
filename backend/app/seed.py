"""Demo seed — DESTROYS the database it is pointed at, recreates the schema
through Alembic, then loads the labelled demo business. Mirrors the frontend
mock's seed so the SAME Playwright suite proves the real backend.

This is demo/development tooling. It refuses to run against anything that is
not explicitly a disposable database:

    MIYONE_ENV=dev  python -m app.seed --i-understand-this-deletes-everything
    MIYONE_ENV=demo python -m app.seed --i-understand-this-deletes-everything

The tester/production database is NEVER seeded: its schema comes from
`alembic upgrade head` and its data from real owners signing up."""
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .core.config import settings
from .core.db import Base, SessionLocal, engine
from .core.security import hash_password
from .models import (
    AuthSession,  # noqa: F401  (ensure model registration)
    Business,
    BusinessMember,
    Category,
    Debt,
    Party,
    Product,
    Sale,
    StockMovement,
    Transaction,
    User,
)

BUSINESS_ID = "b-demo-1"
ACTOR = "Mariama"


def utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc)


def days_ago(n: int, hour: int = 10) -> datetime:
    """A past timestamp, never a future one.

    Pinning today's records to a fixed hour meant that seeding before that hour
    dated them in the FUTURE, so they fell outside every window: Home's default
    "Today" read Le 0, and on the 1st of a month the whole month read Le 0 while
    the same week showed a healthy business. Demo data must never be ahead of
    the clock."""
    now = datetime.now(timezone.utc)
    d = (now - timedelta(days=n)).replace(hour=hour % 24, minute=30, second=0, microsecond=0)
    if n < 0:  # a deliberately FUTURE date (a due date not yet reached) must stay in the future
        return d
    return min(d, now - timedelta(minutes=5))


def whole_le(minor: float) -> int:
    return round(minor / 100) * 100


_seq = 0


def next_id(prefix: str) -> str:
    global _seq
    _seq += 1
    return f"{prefix}-seed-{_seq}"


def tx(db, type_: str, amount_minor: int, category: str, occurred_at: datetime, source: str = "MANUAL", description: str | None = None, counterparty_id: str | None = None):
    db.add(
        Transaction(
            id=next_id("t"),
            business_id=BUSINESS_ID,
            type=type_,
            status="POSTED",
            amount_minor=amount_minor,
            category_name=category,
            description=description,
            occurred_at=occurred_at,
            created_at=occurred_at,
            recorded_by=ACTOR,
            source=source,
            counterparty_id=counterparty_id,
        )
    )
    if source == "SALE" and type_ == "INCOME":
        db.add(Sale(id=next_id("s"), business_id=BUSINESS_ID, total_minor=amount_minor, occurred_at=occurred_at))


def movement(db, product_id: str, type_: str, delta: int, unit_cost: int | None, occurred_at: datetime, note: str | None = None):
    db.add(
        StockMovement(
            id=next_id("mv"),
            business_id=BUSINESS_ID,
            product_id=product_id,
            type=type_,
            quantity_delta=delta,
            unit_cost_minor=unit_cost,
            occurred_at=occurred_at,
            recorded_by=ACTOR,
            note=note,
        )
    )


SEED_FLAG = "--i-understand-this-deletes-everything"
SEEDABLE_ENVS = ("dev", "demo")


def guard(argv: list[str]) -> None:
    """Two independent locks: the environment must be disposable AND the
    operator must say out loud that they want the data gone."""
    if settings.env not in SEEDABLE_ENVS:
        sys.exit(
            f"Refusing to seed: MIYONE_ENV={settings.env!r} is not one of {SEEDABLE_ENVS}. "
            "The tester/production database is never seeded."
        )
    if SEED_FLAG not in argv:
        sys.exit(f"Refusing to seed: this drops EVERY table. Re-run with {SEED_FLAG}")


def reset_schema() -> None:
    """Drop everything, then rebuild through the SAME path production uses, so
    the demo database has exactly the schema a migrated database has."""
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    backend_dir = Path(__file__).resolve().parents[1]
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend_dir, check=True)


def run() -> None:
    reset_schema()
    with SessionLocal() as db:
        user = User(id="u-demo-1", email="mariama@example.sl", password_hash=hash_password("demo-password"), full_name=ACTOR)
        db.add(user)
        db.add(Business(id=BUSINESS_ID, name="Mariama's Provisions"))
        db.flush()
        db.add(BusinessMember(id="bm-demo-1", business_id=BUSINESS_ID, user_id=user.id, role="OWNER"))

        for cid, name, kind in [
            ("cat-in-sales", "Sales", "INCOME"),
            ("cat-in-other", "Other income", "INCOME"),
            ("cat-ex-stock", "Stock purchase", "EXPENSE"),
            ("cat-ex-transport", "Transport", "EXPENSE"),
            ("cat-ex-rent", "Rent", "EXPENSE"),
            ("cat-ex-utilities", "Utilities", "EXPENSE"),
            ("cat-ex-wages", "Wages", "EXPENSE"),
            ("cat-ex-general", "General expense", "EXPENSE"),
        ]:
            db.add(Category(id=cid, business_id=BUSINESS_ID, name=name, kind=kind))

        for pid, name, unit, sell, cost, threshold in [
            ("p-101", "Rice (50kg bag)", "bag", 85_000_00, 70_000_00, 5),
            ("p-102", "Cooking oil (5L)", "piece", 30_000_00, 24_000_00, 5),
            ("p-103", "Sugar (1kg)", "kg", 4_500_00, 3_600_00, 10),
            ("p-104", "Soap (bar)", "piece", 1_500_00, 1_000_00, 12),
        ]:
            db.add(Product(id=pid, business_id=BUSINESS_ID, name=name, unit=unit, selling_minor=sell, cost_minor=cost, low_stock_threshold=threshold))

        db.flush()
        movement(db, "p-101", "PURCHASE", 60, 70_000_00, days_ago(20, 8))
        movement(db, "p-102", "PURCHASE", 5, 24_000_00, days_ago(15, 8))
        movement(db, "p-102", "SALE", -2, None, days_ago(3, 12))
        movement(db, "p-103", "PURCHASE", 40, 3_600_00, days_ago(10, 8))
        movement(db, "p-104", "PURCHASE", 60, 1_000_00, days_ago(25, 8))
        movement(db, "p-104", "SALE", -2, None, days_ago(2, 15))

        for cid, name, phone in [
            ("c-201", "Aminata", "+232 76 000001"),
            ("c-202", "Foday", "+232 76 000002"),
            ("c-203", "Isatu", None),
        ]:
            db.add(Party(id=cid, business_id=BUSINESS_ID, kind="customer", name=name, phone=phone))
        db.flush()
        db.add(Party(id="s-301", business_id=BUSINESS_ID, kind="supplier", name="Musa Wholesale", phone="+232 76 000009"))

        db.flush()
        db.add(Debt(id="r-401", business_id=BUSINESS_ID, kind="receivable", counterparty_id="c-201", amount_minor=120_000_00, settled_minor=0, since=days_ago(12), due_date=days_ago(2), source="SALE"))
        db.add(Debt(id="r-402", business_id=BUSINESS_ID, kind="receivable", counterparty_id="c-202", amount_minor=45_000_00, settled_minor=0, since=days_ago(20), due_date=days_ago(-6), source="SALE"))
        db.add(Debt(id="p-501", business_id=BUSINESS_ID, kind="payable", counterparty_id="s-301", amount_minor=200_000_00, settled_minor=50_000_00, since=days_ago(9), due_date=days_ago(-5), source="PURCHASE"))

        # Older history: weekly sales with growth + stock/transport/rent (mock parity).
        for week in range(52, 4, -1):
            growth = 1 + (52 - week) * 0.012
            wobble = 0.82 if week % 4 == 0 else 1.12 if week % 3 == 0 else 1.0
            sales_minor = whole_le(9_000_000 * growth * wobble)
            tx(db, "INCOME", sales_minor, "Sales", days_ago(week * 7, 11), "SALE")
            if week % 2 == 0:
                tx(db, "EXPENSE", whole_le(sales_minor * 0.42), "Stock purchase", days_ago(week * 7 - 1, 8))
            if week % 4 == 1:
                tx(db, "EXPENSE", 1_800_000, "Transport", days_ago(week * 7 - 2, 7))
        # Recent month: daily sales.
        for day in range(34, 0, -1):
            wobble = 0.6 if day % 7 == 0 else 1.35 if day % 5 == 0 else 1.1 if day % 3 == 0 else 0.9
            tx(db, "INCOME", whole_le(1_600_000 * wobble), "Sales", days_ago(day, 10 + (day % 6)), "SALE")
            if day % 4 == 0:
                tx(db, "EXPENSE", whole_le(2_400_000 * (1.5 if day % 8 == 0 else 1)), "Stock purchase", days_ago(day, 8))
            if day % 9 == 0:
                tx(db, "EXPENSE", 900_000, "Transport", days_ago(day, 7))
        for month in range(12, 0, -1):
            tx(db, "EXPENSE", 5_000_000, "Rent", days_ago(month * 30, 9))

        # Recent explicit rows (mock parity).
        tx(db, "INCOME", 4_500_000, "Sales", days_ago(0, 9), "SALE")
        # One cost dated TODAY as well. Without it, a demo on the 1st of a
        # month shows income and no expenses, so the month view reports a 100%
        # margin — arithmetically right, and it looks like a broken number.
        tx(db, "EXPENSE", 800_000, "Transport", days_ago(0, 8), "MANUAL", "Okada to market")
        tx(db, "INCOME", 12_000_000, "Sales", days_ago(1, 12), "SALE")
        tx(db, "EXPENSE", 3_500_000, "Stock purchase", days_ago(1, 8), "MANUAL", "Rice, 2 bags")
        tx(db, "INCOME", 8_000_000, "Sales", days_ago(3, 15), "SALE")
        tx(db, "EXPENSE", 1_500_000, "Transport", days_ago(4, 7))
        tx(db, "INCOME", 6_500_000, "Sales", days_ago(6, 11), "SALE")
        tx(db, "EXPENSE", 2_000_000, "Transport", days_ago(12, 9))
        tx(db, "INCOME", 15_000_000, "Sales", days_ago(14, 13), "SALE")

        db.commit()
    print("Seeded demo business (mariama@example.sl / demo-password).")


if __name__ == "__main__":
    guard(sys.argv[1:])
    run()
