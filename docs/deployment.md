# MI YONE — Deployment (tester environment on Render)

This is the operating manual for the live tester environment. It assumes the
repository at the commit that introduced `render.yaml`, and Render as the
platform (owner decision). Nothing here changes product behaviour.

```
browser ──HTTPS──▶ miyone-web  (Next.js 15, public web service, Frankfurt)
                       │  /api/v1/*  same-origin rewrite proxy — cookies untouched, no CORS
                       ▼
                   miyone-api  (FastAPI, PRIVATE service, 1 instance, 1 worker)
                       │  /var/data (persistent disk) → product photos
                       ▼
                   miyone-db   (managed PostgreSQL 16, paid plan → continuous backups + PITR)
```

## 1. Services and what each needs

| Service | Type | Root | Build | Pre-deploy | Start | Health |
|---|---|---|---|---|---|---|
| `miyone-api` | private | `backend/` | `pip install -r requirements.txt` | **`alembic upgrade head`** | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips='*'` | `/readiness` (503 until DB reachable **and** schema at head) |
| `miyone-web` | web (public) | `frontend/` | `npm ci && npm run build` | — | `npm run start -- --port $PORT` | `/welcome` |
| `miyone-db` | PostgreSQL 16 | — | — | — | — | — |

Everything above is declared in `render.yaml`; the dashboard only receives the secrets.

Why one instance and one worker: the rate limiter is in-process and photos are on a local disk. Both are documented seams (Redis / object storage) for when there is a reason to scale. Five to twenty testers are nowhere near that.

## 2. Environment variables

**`miyone-api`**

| Variable | Value | Secret | Why |
|---|---|---|---|
| `PYTHON_VERSION` | `3.11.15` | no | The version the suite passed on |
| `MIYONE_ENV` | `production` | no | Forces `Secure` cookies, hides `/api/docs`, **blocks the seed**, blocks migration downgrades |
| `MIYONE_DATABASE_URL` | from `miyone-db` (internal connection string) | yes (injected) | The only database the API ever touches |
| `MIYONE_COOKIE_SECURE` | `true` | no | Already forced by `MIYONE_ENV`; set explicitly so nobody wonders |
| `MIYONE_UPLOAD_DIR` | `/var/data/uploads` | no | On the persistent disk — photos survive deploys and restarts |
| `MIYONE_AI_PROVIDER` | `anthropic` | no | Real Partner AI for testers (owner decision) |
| `MIYONE_AI_API_KEY` | *typed in dashboard* | **yes** | Never in the repo, never in logs |
| `MIYONE_AI_MODEL` | `claude-sonnet-4-5` | no | Confirm the id against the current model list when the key is entered |
| `MIYONE_RESEARCH_PROVIDER` | `none` | no | Live market research **off** for the tester week (owner decision); the Partner says "I can't verify that right now" |
| `MIYONE_WA_MODE` | `test` | no | Labelled test adapter until Meta credentials exist |

**`miyone-web`**

| Variable | Value | Secret | Why |
|---|---|---|---|
| `NODE_VERSION` | `22` | no | Tested on Node 22 |
| `MIYONE_BACKEND_HOSTPORT` | from `miyone-api` (`hostport`) | no (injected) | `next.config.mjs` turns it into `MIYONE_BACKEND_URL=http://<host>:<port>` — the proxy target. Needed at build and run time |
| `NEXT_PUBLIC_MIYONE_SCAN` | **unset** | — | Scan-to-sell stays locked ("Coming very soon") for testers |
| `MIYONE_MOCK_API` | **never set** | — | The mock has no authentication; the build refuses to start without a real backend URL anyway |

The **demo** environment (hackathon day) is the same blueprint applied a second time with `MIYONE_ENV=demo`, `NEXT_PUBLIC_MIYONE_SCAN=on`, and the seed run once from the API service's shell:
`python -m app.seed --i-understand-this-deletes-everything`. Create it in the last days before the event; the tester environment is never seeded.

## 3. First deployment — exact procedure

1. **Render → Blueprints → New Blueprint Instance**, pick this repository and branch. Render reads `render.yaml` and lists the three resources.
2. It asks for every `sync: false` value: enter `MIYONE_AI_API_KEY`. Nothing else is secret.
3. Apply. Order of events: database created → API built → **`alembic upgrade head` creates the schema** → API starts → `/readiness` turns 200 → web built (with the API's private host:port available) → web starts.
4. Open `https://miyone-web-<hash>.onrender.com/api/v1/system/readiness` — expect `{"success":true,"data":{"status":"ready","revision":"0001"}}`. This one URL proves browser → Next → FastAPI → PostgreSQL → migrated schema.
5. Open `/welcome`. Sign up a **throwaway** account, record a sale, open Stock, add a product photo.
6. In Render, **Manual Deploy → Restart** the API service. Reload the app: the sale and the photo are still there (database persistence + disk persistence).
7. Sign up a **second** throwaway account in another browser. From it, request the first account's business URL (`/api/v1/businesses/<first-id>/products`) — expect **404**. Tenant isolation holds across the real network.
8. Confirm the session cookie in DevTools → Application → Cookies: `miy_session`, `HttpOnly`, `Secure`, `SameSite=Lax`.
9. **Run the drill** in `backend/ops/RESTORE-DRILL.md` against this database. Record the result in § 7.
10. Delete the throwaway data so testers start on a clean database: in the API shell, `alembic downgrade base` is **refused** in production (by design) — instead, in Render, delete and recreate `miyone-db` from the blueprint, or run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in the database's psql console, then **Manual Deploy** the API so `alembic upgrade head` recreates the empty schema. Confirm `/api/v1/system/readiness` is 200 and `python -m app.ops list-users` prints `0 row(s)`.
11. Only now: invite testers (§ 5).

A custom domain is optional: Render → web service → Custom Domains; TLS is automatic. Nothing in the app depends on the hostname.

## 4. Every later deployment

`autoDeployTrigger: off` — a push does nothing until you click **Manual Deploy** on each service. Deploy the API first (its pre-deploy step migrates the database; a failed migration fails the deploy and the previous version keeps serving), then the web service. After each deploy, hit `/api/v1/system/readiness`.

Schema changes: edit `models.py` → `alembic revision --autogenerate -m "…"` → read the generated file → `alembic upgrade head` locally → run the suite (it includes `alembic check`) → commit the migration with the model change → deploy. Never edit the database by hand. Never use `create_all` outside tests.

## 5. Tester onboarding (manual, no password reset)

1. The tester opens the public URL on their phone and taps **Set up your business**: name, business name, phone or email, a password of at least 10 characters. That is the whole onboarding — no email is sent, nothing to verify.
2. If a tester forgets their password: Render → `miyone-api` → **Shell** → `python -m app.ops set-password <their identifier>` → type the new password twice (it is never shown or logged). Every existing session for that account is signed out; they sign in again with the new password. Tell them the password in person or by voice, never by SMS/WhatsApp.
3. `python -m app.ops list-users` shows identifiers, names and business names — nothing else — to check who has signed up.
4. Sign-up is rate-limited to 5 per 10 minutes per IP. If several testers sign up from one shop's Wi-Fi at once, wait ten minutes between batches.

What testers need to know: records are saved on the server, not the phone — signing in on another phone shows the same business; "Fix this record" and "Remove this record" keep history; the Partner answers from their own records and says so; voice needs a Chrome browser on Android; the web (market research) mode is off during testing.

## 6. Monitoring during the tester week

- Render → service → **Logs**. Every request is one line with a `request_id`; every 500 is an `unhandled_error` line with a traceback under the same id the tester saw in their error message.
- `/api/v1/system/readiness` from any browser is the health check.
- Render → database → **Metrics** for connections and storage; the smallest plan is ample for this round.
- Anthropic console: set a monthly spend cap on the key before entering it.

## 7. Backup, restore, and the drill log

Procedure: `backend/ops/RESTORE-DRILL.md`. Scripts: `ops/backup.sh`, `ops/restore.sh`, `ops/rowcounts.sh`.

| Date | Environment | Dump | Result | Signed |
|---|---|---|---|---|
| 2026-09-03 | local reference run (alembic-created DB, real API data) | `miyone-miyone_tester-20260903T034946Z.dump` | PASS — counts identical, revision 0001, readiness ready, login 200, figures match | Claude |
| | Render `miyone-db` (before first tester) | | | *owner* |

## 8. Known accepted limitations for this round

Real-phone voice/Krio transcription is field-tested by the owner; the offline queue is in-memory (a page reload loses unsent records — the UI says so); the history list shows the latest 100 records (older ones via the date filter); market research stays off; Meta/WhatsApp verification pending; photos are covered by disk snapshots only, not by `pg_dump`; a single API instance.
