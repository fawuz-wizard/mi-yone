"""Default categories seeded for every new business (Phase 2 M3)."""
from sqlalchemy.orm import Session

from ..common.ids import gen_id
from ..models import Category

DEFAULTS = [
    ("Sales", "INCOME"),
    ("Other income", "INCOME"),
    ("Stock purchase", "EXPENSE"),
    ("Transport", "EXPENSE"),
    ("Rent", "EXPENSE"),
    ("Utilities", "EXPENSE"),
    ("Wages", "EXPENSE"),
    ("General expense", "EXPENSE"),
]


def seed_categories(db: Session, business_id: str) -> None:
    for name, kind in DEFAULTS:
        db.add(Category(id=gen_id("cat"), business_id=business_id, name=name, kind=kind, is_system=True))
