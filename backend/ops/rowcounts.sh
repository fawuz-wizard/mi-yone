#!/usr/bin/env bash
# Exact row count of every table — run on the SOURCE before a backup and on
# the RESTORED copy afterwards; the two listings must be identical.
#   ./ops/rowcounts.sh "$MIYONE_BACKUP_URL"      (or any connection string)
set -euo pipefail
URL="${1:?Usage: rowcounts.sh <connection-url>}"
URL="${URL/postgresql+psycopg2:\/\//postgresql://}"
psql "$URL" -tAc "
SELECT table_name || ': ' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name"
