#!/usr/bin/env bash
# MI YONE — logical database backup (pg_dump, custom format, compressed).
#
# Usage:
#   MIYONE_BACKUP_URL='postgresql://user:pass@host:5432/dbname?sslmode=require' ./ops/backup.sh [output-dir]
#
# The URL is read from the environment ONLY — never passed on the command line
# (it would land in shell history and `ps` output). Use the database's EXTERNAL
# connection string when running from your own machine. Output:
#   <output-dir>/miyone-<dbname>-<UTC timestamp>.dump   (+ .sha256)
#
# Restore with ./ops/restore.sh (into a scratch database — never straight over
# the live one). Platform continuous backups / point-in-time recovery remain
# the first line of defence; this file is the copy YOU hold.
set -euo pipefail

: "${MIYONE_BACKUP_URL:?Set MIYONE_BACKUP_URL to the database connection string (not as an argument)}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

DB_NAME="$(python3 - <<'EOF'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["MIYONE_BACKUP_URL"].replace("postgresql+psycopg2://", "postgresql://"))
print(u.path.lstrip("/").split("?")[0] or "db")
EOF
)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/miyone-${DB_NAME}-${STAMP}.dump"

echo "Backing up '$DB_NAME' → $FILE"
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --dbname="${MIYONE_BACKUP_URL/postgresql+psycopg2:\/\//postgresql://}" \
  --file="$FILE"

sha256sum "$FILE" > "$FILE.sha256"
SIZE="$(du -h "$FILE" | cut -f1)"
TABLES="$(pg_restore --list "$FILE" | grep -c 'TABLE DATA' || true)"
echo "Done: $SIZE, $TABLES tables with data, checksum in $FILE.sha256"
if [ "$TABLES" -lt 1 ]; then
  echo "WARNING: the dump contains no table data — check the connection string." >&2
  exit 2
fi
