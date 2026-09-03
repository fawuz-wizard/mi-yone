# MI YONE backend

FastAPI + PostgreSQL modular monolith per the Phase 2 (Rev 2) architecture.

- **Sessions**: server-side opaque tokens (owner-approved), argon2id passwords,
  HttpOnly cookie + Bearer support, sliding 30d / absolute 90d expiry.
- **Ledger**: immutable transactions (no UPDATE/DELETE of financial fields);
  corrections = reversal + corrected row; idempotency keys on transactions and
  sales; money = BIGINT minor units with server-side SLE display strings.
- **Tenancy**: every route under /businesses/{bid} passes the membership guard;
  cross-tenant probes return 404 (adversarially tested).
- **Analytics**: dashboard / performance / reports computed LIVE from the ledger
  on every request (cash vs booked P/L kept honest); CSV export server-side.

## Run

```bash
pip install -r requirements.txt
# PostgreSQL: role miyone / db miyone (see app/core/config.py or MIYONE_DATABASE_URL)
alembic upgrade head            # creates / updates the schema — the ONLY way, everywhere
uvicorn app.main:app --port 8000
```

Demo data (development only — this DROPS every table first, then rebuilds the
schema through Alembic and loads the labelled demo business):

```bash
python -m app.seed --i-understand-this-deletes-everything   # refuses unless MIYONE_ENV is dev or demo
```

Frontend against this backend:

```bash
cd ../frontend
MIYONE_BACKEND_URL=http://localhost:8000 npm run build && MIYONE_BACKEND_URL=http://localhost:8000 npm start
# without MIYONE_BACKEND_URL the in-repo MOCK serves /api/v1 instead
```

Demo login: `mariama@example.sl` / `demo-password`.

## Tests

```bash
python -m pytest tests/   # needs db miyone_test — built ONCE per run by `alembic upgrade head`, never create_all
```

The frontend's full Playwright suite (28 tests) passes unchanged against this
backend — run it with `MIYONE_BACKEND_URL` set as above.

## Schema changes

```bash
# edit app/models.py, then:
alembic revision --autogenerate -m "what changed"   # read the generated file
alembic upgrade head
python -m pytest tests/                              # includes `alembic check` (drift = failure)
```

`/readiness` (and `/api/v1/system/readiness` through the frontend proxy) answers
503 until the database is reachable AND at the migration head.

## Operations

- `ops/backup.sh`, `ops/restore.sh`, `ops/rowcounts.sh`, `ops/RESTORE-DRILL.md` — logical backup into a file you hold, restore into a scratch database, verified.
- `python -m app.ops set-password <identifier>` — manual password reset for testers (no email feature exists); signs out their sessions.
- `python -m app.ops list-users`
- Deployment: `../render.yaml` + `../docs/deployment.md`.

## Known gaps (tracked, deliberate)

- Email verification/reset transport, audit query API: post-hackathon.
