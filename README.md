# MI YONE

**Own your money. Understand your business. Make better decisions.**

Financial Intelligence & Business Operating Platform for small and growing
businesses in Sierra Leone. Built for the Orange Summer Challenge
(theme: *AI as business accelerator*) to production standard.

## Repository

- `frontend/` — Next.js 15 + TypeScript + Tailwind (design per the Phase 4 spec; tokens only)
- `backend/` — FastAPI + SQLAlchemy 2 + PostgreSQL 16 (architecture per Phase 2)
- `docs/` — the approved phase documents (product, architecture, experience, design spec)
- `CLAUDE.md` — rules for AI coding agents working on this repo

## Quick start (local development)

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 16 running locally (a database the default `backend/app/core/config.py` settings can reach, or set `MIYONE_DATABASE_URL`)

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python -m app.seed          # creates tables + labeled demo data (run once, or to reset)
uvicorn app.main:app --port 8000
```

Demo sign-in after seeding: **mariama@example.sl / demo-password**
(business "Mariama's Provisions"). Or create your own business via the signup page.

### 2. Frontend

```bash
cd frontend
npm install
```

Run against the **real backend**:

```bash
# macOS / Linux
MIYONE_BACKEND_URL=http://localhost:8000 npm run dev

# Windows PowerShell
$env:MIYONE_BACKEND_URL="http://localhost:8000"; npm run dev
```

Run against the **in-repo mock** (no backend/database needed — UI development only;
the mock is clearly labeled and implements the same API contract):

```bash
npm run dev
```

Open http://localhost:3000.

## Testing voice and QR scanning

Both need a **secure context**: `localhost` on your PC counts, but a plain
`http://<pc-ip>:3000` opened from a phone does **not** — the browser will
silently refuse the camera and microphone.

- **Voice capture** (mic button): works on desktop Chrome and Android Chrome —
  allow the mic permission; it needs internet (the browser's speech service is
  online). Typed quick entry is always available beside it.
- **QR camera scanning**: uses the browser's native barcode detector, which
  ships on **Android Chrome** (full point-camera-at-label experience) but not
  on Windows desktop Chrome or iOS Safari — there the scan screen shows an
  honest note and the always-present **tap-to-add product grid** carries the
  same server-validated checkout.
- **Testing from a phone**: tunnel your dev server to a temporary HTTPS URL,
  e.g. `npx ngrok http 3000` (or Cloudflare Tunnel), and open that URL on the
  phone.
- Printable QR labels: Stock → the QR icon → `/labels` → Print.

## Optional environment variables (backend)

All AI/integration features degrade honestly when unconfigured — nothing is faked.

| Variable | Effect when set |
| --- | --- |
| `MIYONE_DATABASE_URL` | PostgreSQL connection string (overrides default) |
| `MIYONE_AI_PROVIDER=anthropic` + `MIYONE_AI_API_KEY` | Partner AI replies and photo→product suggestions use the Anthropic model (grounded on deterministic facts only; falls back to the built-in local composer on any failure). Unset = local composer / suggestions honestly reported unavailable. |
| `MIYONE_AI_MODEL` | Model id (default `claude-sonnet-4-5`) |
| `MIYONE_WA_ACCESS_TOKEN` + `MIYONE_WA_CATALOG_ID` | WhatsApp catalog import uses the real Meta Graph adapter. Unset = clearly-labeled TEST adapter. |
| `MIYONE_UPLOAD_DIR` | Where product photos are stored (default local `uploads/`) |

## Test suites

```bash
# frontend (from frontend/)
npm run typecheck && npm test && npm run build
npx playwright test                                        # vs mock API
MIYONE_BACKEND_URL=http://localhost:8000 npx playwright test  # same suite vs real backend

# backend (from backend/)
python -m pytest
```

Backend tests use a SEPARATE database, `miyone_test`, which they wipe and
rebuild on every test — deliberately isolated so they can never touch your
real data. Create it once:

```bash
sudo -u postgres psql -c "CREATE DATABASE miyone_test OWNER miyone;"
```

The full Playwright suite passes unchanged against the mock **and** the real
backend — keep it that way.

## Non-negotiables (see CLAUDE.md for the full list)

- The server computes all money truth; the client renders server `display` strings verbatim.
- Financial records are immutable — corrections are reversal + re-entry ("Fix"), history stays visible.
- Idempotency keys are minted when a capture flow opens; double submission never creates two records.
- The AI never invents business facts — deterministic services compute, AI explains.
- No fake integrations: unconfigured providers say so.

## Known pre-production items

Alembic initial migration (before a production deploy), email transport,
durable offline queue (gated on an approved technical design), rate limiting
hardening, cloud file storage. Batch/lot QR codes are a future Premium feature
by design — not in this build.
