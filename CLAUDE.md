# MI YONE — Rules for AI coding agents (Claude Code, Kiro, etc.)

MI YONE ("My Own") is a financial intelligence & business operating platform for
SMEs in Sierra Leone. **Own your money. Understand your business. Make better
decisions.** This is a production product, never called an "MVP".

Read `docs/` before making changes — the phase documents there are the approved
contract. Phase 4 (design spec) is law for all UI work; Phase 2 for architecture.

## Non-negotiable rules

1. **The spec is the source of truth.** Do not redesign, add components, colors,
   navigation, or features not in the Phase 4 spec. Genuine conflicts: stop,
   document, ask the owner — never invent workarounds.
2. **No client-side financial calculation.** The server computes all money truth
   and provides `display` strings (integer minor units + formatted). The client
   renders them verbatim. Input grouping/prefill is allowed; accounting is not.
3. **Tokens only.** Components consume semantic CSS variables generated from
   `frontend/tokens/`. Any hard-coded hex/px/shadow/radius outside the token
   system fails review. Palette: Ink & Clay (locked) — paper #FAF7F1, ink
   #1F1912, clay #9A4520, money-in green #1B7A4B (green = financial meaning ONLY).
4. **All UI strings go through the message catalog**
   (`frontend/src/shared/i18n/messages/`). No hard-coded user-facing text.
   Krio-ready: full-sentence templates, ±40% length tolerance.
5. **Shop-floor vocabulary.** Users never see: ledger, reversal, idempotency,
   receivable, payable, settlement, mutation, queue, sync, HTTP codes. They see:
   money in/out, fix this record, owes you, you owe, mark as paid.
6. **Financial records are immutable.** No delete, no edit of posted amounts —
   corrections are reversal + re-entry ("Fix"), history stays visible.
7. **Idempotency keys** are generated when a capture flow OPENS and reused on
   every retry. Double submission must never create two records (E2E-tested).
8. **The mock API (`frontend/src/mocks/`) is clearly labeled MOCK** and
   implements the Phase 2 contract shapes. Never blur mock and real; never claim
   an integration exists. The real backend is FastAPI + PostgreSQL (not built yet);
   auth = server-side opaque sessions (JWT was explicitly rejected).
9. **Accessibility is definition-of-done:** WCAG 2.1 AA, 44px targets, visible
   focus ring, sr-labels, reduced-motion, 200% scaling. axe E2E scans must pass.
10. **No**: gradients, AI sparkles/robots/glow, chart libraries, component
    libraries (MUI/Ant), Redux, styled-components, new dependencies without a
    stated reason. Light theme only in v1.
11. **Structure:** features are isolated (`src/features/*` never import each
    other); design-system components have no business logic or API calls; routes
    compose features. Follow existing patterns before creating new ones.
12. **Verify before done:** `npm run typecheck && npm test && npm run build`,
    plus `npm run e2e` for flows. Feature-by-feature commits, meaningful messages.

## Current state (Phase 5, milestone 8 — REAL BACKEND EXISTS)

Frontend done: tokens, full design system, app shell, Home (health + performance
chart + attention + insight), Money (5 tabs), complete capture engine
(sale paid/credit/partial, expense, debt payments, categories, backdating),
fix-with-history + remove-as-reversal, Stock (movement ledger, add-stock,
stock-check, low-stock), Customers/Suppliers records, Reports/Insights
(cash vs booked P/L, CSV, print-PDF), natural-language + voice quick entry
(deterministic interpreter `features/capture/interpret.ts` — EN/Krio/mixed,
never invents values, never guesses intent; routes sale/expense into the ONE
capture sheet as an editable confirmation preview, purchase → existing
add-stock endpoint, owes-you/you-owe → existing debt endpoints, ambiguous →
asks; validates against the business's own records — unusual price,
insufficient stock, conflicting totals [block], possible duplicates — with
block vs confirm-anyway severities), Business Watch (server-derived alerts —
stock, overdue debts, sales/profit/expense shifts, unusual costs, incomplete
records — what/why/action with info/warning/critical severity, state-derived so
never duplicated; Home's attention slot upgraded) + progression/regression
trend tiles (`/analytics/trends`: per-metric value, %-change, ↑↓→ direction,
tone; direction withheld when history is insufficient).
Partner AI (backend `app/ai/` — deterministic intent router + evidence builder
over existing analytics/watch/trends; provider abstraction: built-in "local"
composer default, Anthropic adapter env-gated via MIYONE_AI_PROVIDER/API_KEY
with grounded-facts-only prompt + local fallback; conversation in ai_messages;
Partner is READ-ONLY over records; chat UI in features/partner) and WhatsApp
catalog integration (`app/integrations/catalog.py` provider boundary — TEST
adapter default, honestly labeled, Meta Graph adapter credential-gated via
MIYONE_WA_*; connect → import → review → approve/skip with duplicate detection;
approve creates a normal product; UI in features/stock/WhatsAppImportSheet).
Setup flow (5I): welcome → /signup (name, business name, phone/email, password
≥10) → /auth/register → signed in to a fresh business; BUSINESS_ID is now
localStorage-backed (`setActiveBusiness`), sign-in/up do a full navigation to
rebind it; mock register signs into the labeled demo store (single-tenant) and
mock login now validates the demo credentials.
Photo-to-Product: file storage architecture (`core/storage.py`, local disk,
validated server-generated keys, MIYONE_UPLOAD_DIR), Product gains optional
description/sku/category/image_key; image upload/serve/remove routes
(tenant-guarded, ADMIN+ mutations); `ai/vision.py` suggestion provider
(Anthropic env-gated, name/category/description ONLY — never price; local →
available:false, honest); photo-first product form with preview/replace/remove,
duplicate-name warning, suggestion chips; detail-sheet photo block.
QR Scan-to-Sell (MVP; batch QR system = future Premium, do not build): QR
payload `MIYONE:P1:<product-id>` (shared/qr.ts codec, versioned for future
`B1:` batch codes; no business data in the code), qrcode npm lib for local
rendering (stated dep reason), /labels print sheet + per-product QR sheet,
features/scan (BarcodeDetector scanner w/ tap-to-add fallback, cart,
idempotent multi-item checkout via NEW trade.checkout — SAME primitives,
server-computed totals + hard stock validation), chooser gains Scan to sell.
Overview refinement (M17): dashboard payload gains period-scoped spending
summary (top 3 expense categories) + profit with server-computed margin_pct
(from the SAME report() logic as Reports; margin null on zero revenue);
/analytics/trends gains `contributors` — largest measured change per dimension
(spending category, product units, money in vs out), server-composed factual
sentences, contribution NEVER causation, withheld without history;
ai/evidence.overview_line() upgrades Home's insight slot to the Partner
one-line summary when history allows (router-level, deterministic fallback
stands otherwise); Home adds ProfitRow + SpendingCard (features/home/
OverviewCards.tsx) and TrendsRow renders the contributors block.
Owner refinement: the HealthHeader money-in/money-out pair was REMOVED from
Home (business events, not a wallet; those figures stay in the performance
chart, trend tiles, Money tab, Reports) — LEFT OVER is the sole headline;
health.money_in/out remain in the API payload (Home's hasRecords logic uses
them). The + FAB/chooser is the primary entry point (voice/text/manual/scan
all pre-existing).
66 unit + 76 Playwright E2E green (vs mock AND real backend); 78 backend tests.

Backend done (`backend/`): FastAPI + PostgreSQL per Phase 2 — opaque sessions
(argon2id, hashed tokens), tenant guard (cross-tenant = 404, tested), immutable
ledger with idempotency + reversal/fix, stock movement ledger, parties, sales
orchestration, debts/settlements, LIVE analytics (dashboard/performance/reports),
server-side CSV. 14 pytest green. Seed: `python -m app.seed`
(mariama@example.sl / demo-password). Frontend proxies /api/v1 to it when
`MIYONE_BACKEND_URL` is set (unset = in-repo mock for dev). The FULL Playwright
suite passes unchanged against the real backend — keep it that way.

Not built yet: Setup flow UI (backend /auth/register exists), Partner/Research
shell (AI phase), Settings/People/Help, Alembic initial migration (required
before production deploy), rate limiting, email transport, durable offline
queue (GATED on approved technical design — do not build it). Open owner
decisions: logo art, Partner final name, Insights→Reports rename.
