# MI YONE

**Own your money. Understand your business. Make better decisions.**

Financial Intelligence & Business Operating Platform for small and growing businesses.

## Repository

- `frontend/` — Next.js app (Phase 5 build, per the Phase 4 design specification)
- Backend (FastAPI + PostgreSQL, per Phase 2 architecture) — not yet started

## Status: Phase 5 — first vertical slice

Implements 5A (repo + tokens), 5B core design system, and the **ten-second sale
vertical slice**: welcome → sign in → home → capture → save → toast/undo → money
list → record detail → fix (reversal-based correction with visible history).

⚠ **The API is a MOCK** (`frontend/src/mocks/`): in-memory Next.js route handlers
implementing the Phase 2 contract (envelope, idempotency keys, server-side money
formatting, reversal semantics). It is clearly labeled and never pretends to be a
real integration. Replacing it with the FastAPI backend = pointing the client at
the real `/api/v1`.

## Run

```bash
cd frontend
npm install
npm run dev        # tokens are rebuilt automatically, then Next dev server
npm test           # unit + component tests (Vitest + RTL)
npm run e2e        # Playwright flagship flows (builds happen via npm run build first)
```

Design authority: `claude/phase-4-design-specification.md` in the MI YONE project.
No visual values outside the token system; no client-side financial calculation.
