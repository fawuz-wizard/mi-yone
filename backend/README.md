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
python -m app.seed              # drops + recreates schema, loads the demo business
uvicorn app.main:app --port 8000
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
python -m pytest tests/   # needs db miyone_test; 14 tests: financial core, trade/debts, auth+tenancy
```

The frontend's full Playwright suite (28 tests) passes unchanged against this
backend — run it with `MIYONE_BACKEND_URL` set as above.

## Known gaps (tracked, deliberate)

- **Alembic**: schema is created via metadata (`app/seed.py`) for the demo; the
  versioned initial migration must land before any production deploy (Phase 2 §27).
- Registration exists (`/auth/register`) but the setup-flow UI is a later milestone.
- Rate limiting, email verification/reset transport, audit query API: Phase 2
  hardening items, not yet wired.
