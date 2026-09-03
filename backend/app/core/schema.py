"""Schema version guard (Phase 2 §27).

Production schema is created and changed ONLY by `alembic upgrade head`. This
module lets the running application answer one question — "is the database I
am connected to at the migration head?" — so readiness can say no before a
single request is served against a schema the code does not expect.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


@dataclass(frozen=True)
class SchemaStatus:
    current: str | None  # revision stamped in the database (None = no alembic_version table)
    head: str  # revision the code expects

    @property
    def at_head(self) -> bool:
        return self.current == self.head


def expected_head() -> str:
    script = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI)))
    heads = script.get_heads()
    if len(heads) != 1:  # a branched history is a developer mistake, never deployable
        raise RuntimeError(f"Expected exactly one migration head, found {heads}")
    return heads[0]


def status(conn: Connection) -> SchemaStatus:
    current = MigrationContext.configure(conn).get_current_revision()
    return SchemaStatus(current=current, head=expected_head())
