# MI YONE — backup & restore drill

A backup that has never been restored is a hope, not a backup. This drill is
run **before the first tester is invited**, and again after any change to the
database plan, region, or migration set. It takes about ten minutes.

Two independent layers protect tester data:

| Layer | What | Where | Restores |
|---|---|---|---|
| 1. Platform | Render continuous backups + point-in-time recovery (paid Postgres plan) and daily snapshots of the uploads disk | Render dashboard → database → *Recovery*; API service → *Disk* | Whole database to any point in the window; disk to a daily snapshot |
| 2. Your copy | `ops/backup.sh` — a `pg_dump` file you hold, with a checksum | Your laptop (and one copy elsewhere) | Into a scratch database with `ops/restore.sh` |

Product photos live on the disk, **not** in the database dump. Layer 1 covers
them (disk snapshots). If a photo must be recovered without the platform, it is
gone — accepted for the tester round; object storage is the roadmap fix.

## Prerequisites (your laptop)

- `pg_dump`, `pg_restore`, `psql` version **16** (`pg_dump --version`) — Render runs PostgreSQL 16 and a 15.x client cannot dump a 16 server.
- The database's **external** connection string from the Render dashboard (it ends in `?sslmode=require` or needs it added). It is a secret: export it in the shell, never paste it into a command line, a ticket, or a chat.
- A **scratch database**. On Render: create a second, small Postgres instance named `miyone-restore-check` (delete it after the drill), or locally: `createdb miyone_restore_check`. Its name must contain `restore` or `scratch` — the script refuses anything else.

## The drill

Each step has a pass condition. Stop at the first failure.

**1. Count the source.**
```bash
export MIYONE_BACKUP_URL='postgresql://…external…/miyone?sslmode=require'
./ops/rowcounts.sh "$MIYONE_BACKUP_URL" > source_counts.txt
```
Pass: a list of 17 tables with numbers; `alembic_version: 1`.

**2. Back up.**
```bash
./ops/backup.sh ./backups
```
Pass: `Done: <size>, 17 tables with data, checksum in …`. Keep the `.dump` and `.sha256` together.

**3. Restore into the scratch database.**
```bash
export MIYONE_RESTORE_URL='postgresql://…scratch…/miyone_restore_check?sslmode=require'
./ops/restore.sh ./backups/miyone-miyone-<stamp>.dump
```
Pass: `Checksum OK`, no `pg_restore` errors, `Migration revision … 0001`, a row-count listing.

**4. Compare.**
```bash
./ops/rowcounts.sh "$MIYONE_RESTORE_URL" > restored_counts.txt
diff source_counts.txt restored_counts.txt && echo IDENTICAL
```
Pass: `IDENTICAL`. (If testers were recording during the drill, `auth_sessions`, `audit_events` and the ledgers may be higher in the source — that is the only acceptable difference, and only upward.)

**5. Prove the schema and the application agree with the restored copy.**
```bash
MIYONE_DATABASE_URL="postgresql+psycopg2://…scratch…/miyone_restore_check?sslmode=require" alembic check
MIYONE_ENV=production MIYONE_DATABASE_URL="postgresql+psycopg2://…scratch…" uvicorn app.main:app --port 8010 &
curl -s localhost:8010/api/v1/system/readiness
```
Pass: `No new upgrade operations detected` and `{"status":"ready","revision":"0001"}`.

**6. Sign in against the restored copy** (use a throwaway account you created yourself, never a tester's credentials):
```bash
curl -s -i -X POST localhost:8010/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"identifier":"<your throwaway>","password":"<its password>"}' | grep -iE '^HTTP|set-cookie'
```
Pass: `HTTP/1.1 200` and a `Set-Cookie: miy_session=…; HttpOnly; … SameSite=lax; Secure`. Then read one record through the API (dashboard or a product) and confirm the figures match what the live system shows.

**7. Clean up.** Stop the local server, delete the scratch database, move the dump to safe storage. Record the date, the dump filename and "PASS" in the deployment log (docs/deployment.md § Drill log).

## Recovering the LIVE database (only if something is actually lost)

Do not run `restore.sh` against the live database — it refuses, on purpose.

1. Prefer Render **point-in-time recovery** (dashboard → database → Recovery): it creates a *new* database at the chosen moment. Verify it with steps 5–6 above, then repoint `MIYONE_DATABASE_URL` on the API service to the new database and redeploy. The old database stays untouched for comparison.
2. Only if the platform cannot help: create a fresh empty database, restore your dump into it with `restore.sh` (name it `miyone-restore-<date>` so the guard allows it), verify, then repoint the API to it.
3. Tell the testers what was lost and from when. Never guess; the audit log in the restored copy says exactly what the last recorded actions were.

## Evidence from the reference drill (local, 3 Sep 2026)

Run on a database created by `alembic upgrade head` (never seeded), populated through the real API by a throwaway "Drill Tester" account — sign-up, a product with an opening stock of 10, one paid sale of 3, one credit sale of 1, one expense, one product photo.

```
backup.sh   → Done: 44K, 17 tables with data, checksum written
restore.sh  → Checksum OK · revision 0001 · 17 tables restored (guard refused the non-scratch name first: exit 3)
rowcounts   → source and restored listings IDENTICAL (17 tables; transactions 2, sales 2,
              inventory_movements 3, debts 1, products 1, users 1)
alembic check (restored) → No new upgrade operations detected
readiness (restored)     → {"status":"ready","revision":"0001"}
login (restored)         → 200, cookie HttpOnly; SameSite=lax; Secure — wrong password → 401
dashboard (restored)     → money in Le 135,000 · money out Le 8,000 · left over Le 127,000
product (restored)       → stock 6 (10 − 3 − 1), 3 movements; photo served 200 image/png
```

The same drill must be repeated **on Render** with the real tester database before testers are invited; the local run proves the procedure, not the platform.
