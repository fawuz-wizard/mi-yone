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
(cash vs booked P/L, CSV, print-PDF). 26 unit + 28 Playwright E2E green.

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
