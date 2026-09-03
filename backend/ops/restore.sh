#!/usr/bin/env bash
# MI YONE — restore a backup INTO A SCRATCH DATABASE and verify it.
#
# Usage:
#   MIYONE_RESTORE_URL='postgresql://user:pass@host:5432/miyone_restore_check' ./ops/restore.sh backups/miyone-….dump
#
# Rules this script enforces:
#   * The target URL comes from the environment, never the command line.
#   * The target database name must contain "restore" or "scratch" — the script
#     refuses anything else, so it can never be pointed at the live database by
#     a typo. To recover the live database itself, restore into a scratch
#     database first, verify, and then follow docs/deployment.md § Recovery.
#   * The target database must already exist and be EMPTY (no tables). Create it
#     in the platform dashboard or with: createdb miyone_restore_check
#
# After restoring it prints: the migration revision the restored schema is at,
# and a row count for every table — compare them with the source (backup.sh
# prints the table count; `SELECT count(*)` on the source gives the rows).
set -euo pipefail

: "${MIYONE_RESTORE_URL:?Set MIYONE_RESTORE_URL to the SCRATCH database connection string (not as an argument)}"
DUMP="${1:?Usage: restore.sh <backup.dump>}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }

URL="${MIYONE_RESTORE_URL/postgresql+psycopg2:\/\//postgresql://}"
DB_NAME="$(python3 - <<'EOF'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["MIYONE_RESTORE_URL"].replace("postgresql+psycopg2://", "postgresql://"))
print(u.path.lstrip("/").split("?")[0])
EOF
)"
case "$DB_NAME" in
  *restore*|*scratch*) ;;
  *) echo "Refusing: target database '$DB_NAME' is not a scratch database (name must contain 'restore' or 'scratch')." >&2; exit 3 ;;
esac

if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum --check --quiet "$(basename "$DUMP").sha256") && echo "Checksum OK"
fi

EXISTING="$(psql "$URL" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
if [ "$EXISTING" != "0" ]; then
  echo "Refusing: '$DB_NAME' already has $EXISTING tables. Restore only into an EMPTY scratch database." >&2
  exit 4
fi

echo "Restoring $DUMP → '$DB_NAME'"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$URL" "$DUMP"

echo
echo "Migration revision in the restored database:"
psql "$URL" -tAc "SELECT version_num FROM alembic_version"
echo
echo "Exact row counts in the restored database (compare with ops/rowcounts.sh on the source):"
"$(dirname "$0")/rowcounts.sh" "$URL"
echo
echo "Restore complete. Now verify sign-in against the restored copy (see ops/RESTORE-DRILL.md step 5)."
