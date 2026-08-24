# MI YONE — Phase 2: Technical Architecture, Database & API Foundation

Status: DESIGN — approved-pending. No implementation has begun. This document is the contract the codebase will be built against.
Depends on: `claude/product-understanding.md` (Phase 1 baseline).
Scope guard: no frontend, no polished UI, no AI agent implementation, no Orange Money/bank/payment integrations, no OSUSU, no crypto, no marketplace.
Positioning: MI YONE v1 is a **focused production product with expansion-ready architecture** — not an MVP, not a disposable prototype. "v1" throughout this document means the first production release: deliberately small in scope, built to production standard, built to last.
Rev 2 — incorporates the owner's five corrections: positioning language, authentication decision analysis (§17 — decision pending), monetary model validation (§7), AI-memory taxonomy (§19), simplicity mandate (§34).

---

## 0. Technical Audit

**Environment inspected:** cloud workspace (Linux x86_64, Python 3.11, Node 22, PostgreSQL available via Docker). The user's laptop was unreachable over the device bridge at audit time, so no local repository could be inspected.

**Existing structure:** none accessible. The Claude project contains two artifacts only: the pitch concept PDF and the Phase 1 product-understanding brief. No code, no dependencies, no configuration, no migrations exist in any location this session can see.

**Existing problems:** none (greenfield). One open item: if a Kiro-generated scaffold already exists on the laptop, it must be diffed against this design before implementation — nothing here should blindly overwrite it. Flag this at the start of Phase 3.

**Missing foundation:** everything — repo, backend skeleton, database schema, migrations, auth, CI. That is expected; this document defines it.

**Recommended structure:** modular monolith, single repository, as detailed below. Verdict: proceed as greenfield.

---

## 1. Application Architecture (Final)

**Style: modular monolith.** One FastAPI process, one PostgreSQL database, strict internal module boundaries. Microservices are rejected for this stage: they would add network failure modes, distributed transactions, and deployment complexity with zero benefit at v1 scale. The module boundaries below are the future extraction seams if scale ever demands it.

### 1.1 Final module map

| Module | Exists because | Notes |
|---|---|---|
| `identity` | Someone must prove who they are before anything else. Users, credentials, sessions, verification. | Knows nothing about businesses. |
| `business` | The tenant boundary. Businesses, memberships, roles. Every other business module depends on it. | Owns the authorization primitives. |
| `finance` | The financial ledger: transactions, categories, receivables, payables, settlements. The most protected module. | Append-only discipline (§8). |
| `sales` | A sale is a coordination act — it touches finance (income/receivable), inventory (stock out), and customers, atomically. Deserves its own module rather than bloating finance. | Orchestrates; owns sale + line items. |
| `inventory` | Products and the stock-movement ledger. | Stock is derived, never hand-edited (§10). |
| `customers` | Who owes the business money; contact + history. Not a CRM. | |
| `suppliers` | Who the business owes; contact + purchase history. | |
| `analytics` | The deterministic intelligence engine. Read-only over other modules' data; computes every authoritative metric. | No writes to business data. |
| `ai` | Boundary only in Phase 2: conversation/message schema, context service interface, provider abstraction. Implementation is Phase 3. | Consumes analytics output; never queries raw tables directly. |
| `research` | Boundary only in Phase 2: request schema + provider interface. Isolated from normal AI chat by design. | Phase 3. |
| `integrations` | Provider interfaces (FinancialProvider etc.) + `MockProvider`. No real integrations exist or are pretended to exist. | The future Orange/bank seam. |
| `audit` | Append-only record of security- and finance-relevant actions. Cross-cutting, called by other modules. | §22. |

**Deliberately not modules (yet):** *Notifications* — v1 surfaces alerts through the analytics API (`attention` payload on the dashboard endpoint); a push/SMS/email module is a clean later addition. *Reports* — report generation is an analytics feature until it needs files/async. Creating empty modules "for the future" is the over-engineering this project forbids.

### 1.2 Architecture diagram

```
┌────────────────────────── Clients ──────────────────────────┐
│        Next.js frontend (Phase 4)        API consumers       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS · JWT
┌──────────────────────────▼──────────────────────────────────┐
│                      FastAPI  /api/v1                        │
│  ┌────────── cross-cutting: auth deps · tenant guard ·      │
│  │           validation (Pydantic) · error handler ·        │
│  │           rate limit · request-id logging                 │
│  ├─────────────────────────────────────────────────────────┤
│  │ identity │ business │ finance │ sales │ inventory │      │
│  │ customers │ suppliers │ analytics │ audit │              │
│  │ ai (boundary) │ research (boundary) │ integrations       │
│  │   each module: router → service → repository             │
│  └─────────────────────────────────────────────────────────┘
│         │                        │                            │
│         │              ┌─────────▼──────────┐                 │
│         │              │  Provider ports    │  AIProvider ·   │
│         │              │  (integrations)    │  SearchProvider·│
│         │              │  → MockProvider    │  Financial-     │
│         │              └────────────────────┘  Provider ·     │
│         ▼                                      StorageProvider│
│  ┌─────────────┐   Alembic migrations                        │
│  │ PostgreSQL  │   single DB, business_id on every           │
│  │             │   tenant-owned row                          │
│  └─────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

Dependency rule: modules may depend on `identity`, `business`, `core`, and `common`. Business modules never import each other's repositories — cross-module operations go through the other module's **service** (e.g. `sales` calls `finance.service` and `inventory.service`). `analytics` reads via read-only query services. `ai` consumes only `analytics` and approved context — never raw repositories.

---

## 2. Repository Structure

Single repo (`mi-yone/`), organized by domain, not by technical type. A new developer (or AI agent) finds everything about transactions in one folder.

```
mi-yone/
├── backend/
│   ├── app/
│   │   ├── main.py                  # app factory, router mounting, middleware
│   │   ├── core/                    # config (pydantic-settings), db session,
│   │   │                            # security (hashing, JWT), errors, logging,
│   │   │                            # dependencies (current_user, tenant guard)
│   │   ├── common/                  # response envelope, pagination, money type,
│   │   │                            # base model mixins (id, timestamps)
│   │   └── modules/
│   │       ├── identity/            # router.py · schemas.py · service.py
│   │       │                        # repository.py · models.py
│   │       ├── business/            # + roles.py (role/permission definitions)
│   │       ├── finance/
│   │       ├── sales/
│   │       ├── inventory/
│   │       ├── customers/
│   │       ├── suppliers/
│   │       ├── analytics/           # queries.py (read-only SQL) · service.py
│   │       ├── ai/                  # provider.py (interface) · context.py · models.py
│   │       ├── research/            # provider.py (interface) · models.py
│   │       ├── integrations/        # financial_provider.py · mock_provider.py
│   │       └── audit/
│   ├── alembic/                     # versioned migrations
│   ├── tests/                       # mirrors modules/ + conftest.py, factories.py
│   ├── pyproject.toml               # deps, ruff, mypy, pytest config
│   ├── Dockerfile
│   └── .env.example                 # placeholders only — never real secrets
├── frontend/                        # empty until Phase 4 (README stub only)
├── docs/                            # architecture.md, database.md, api.md,
│                                    # auth.md, testing.md, setup.md, decisions/
├── infrastructure/
│   ├── docker-compose.yml           # api + postgres for local dev
│   └── ci/                          # GitHub Actions: lint · typecheck · test
└── README.md
```

Every module uses the same five files (`router / schemas / service / repository / models`), so patterns are learned once. No `utils/` dumping ground: shared code earns a named home in `common/` or `core/` or stays in its module.

---

## 3. Backend Layer Responsibilities

```
Router (HTTP)  →  Service (application logic)  →  Repository (data access)  →  PostgreSQL
                      │
                      └→ other modules' services · provider ports · audit
```

- **Router**: HTTP concerns only — parse/validate via Pydantic schemas, resolve dependencies (current user, tenant membership), call one service method, shape the response envelope. Zero business logic. Zero SQL.
- **Schemas (Pydantic)**: the API contract. Separate input/output models; output models never leak internal fields (password hashes, internal flags).
- **Service**: the only place business rules live — invariants, orchestration, DB transaction scope, audit calls. Raises typed domain errors (`NotFoundError`, `PermissionDeniedError`, `ValidationFailed`, `ConflictError`) that the global handler maps to HTTP.
- **Repository**: SQLAlchemy queries only. Every tenant-scoped method takes `business_id` as a required parameter (§5). No business decisions.
- **Providers (ports)**: external world (AI, search, future financial rails) behind interfaces in `integrations/`, `ai/`, `research/`. Core logic depends on the interface, never a vendor SDK.

A formal domain-entity layer (DDD aggregates) is intentionally omitted — at this size it would be ceremony. SQLAlchemy models + service invariants are sufficient; the layering leaves room to introduce it later if a module's rules grow dense.

---

## 4. Database Entity Map

PostgreSQL 16. All primary keys are UUIDv7 (time-ordered — index-friendly, non-guessable, safe to expose in URLs, generated app-side). All tables carry `created_at` / `updated_at` (UTC, `timestamptz`). Tenant-owned tables carry `business_id NOT NULL` FK.

### Identity & tenancy
- **users** — id, email (citext, unique), phone (nullable, unique), password_hash, full_name, status (ACTIVE/LOCKED/UNVERIFIED), email_verified_at, mfa_enabled (bool, default false — MFA-ready, not implemented).
- **auth_sessions** — id, user_id, token_hash, expires_at, revoked_at, user_agent, ip. Semantics (opaque session vs refresh token) follow the §17 decision; the table shape serves both.
- **verification_tokens** — id, user_id, purpose (EMAIL_VERIFY/PASSWORD_RESET), token_hash, expires_at, used_at.
- **businesses** — id, name, slug, business_type, currency (char 3, default `SLE`), country (default `SL`), description, status (ACTIVE/ARCHIVED).
- **business_members** — id, business_id, user_id, role (OWNER/ADMIN/STAFF), status (ACTIVE/INVITED/REMOVED), invited_by. Unique (business_id, user_id). **This is the authorization spine.**

### Finance (the protected core)
- **transaction_categories** — id, business_id, name, kind (INCOME/EXPENSE), is_system (seeded defaults), archived_at. Unique (business_id, name, kind).
- **transactions** — id, business_id, type (INCOME/EXPENSE), status (POSTED/REVERSED), **amount_minor (BIGINT > 0)**, currency, category_id, description, occurred_at (business date), reference (external ref, nullable), customer_id / supplier_id (nullable counterparty), source (MANUAL/SALE/SETTLEMENT — provenance), sale_id (nullable), **reverses_transaction_id** (nullable, unique — a reversal points at its target), **idempotency_key** (nullable; partial unique index on (business_id, idempotency_key)), created_by, created_at. **No UPDATE of financial fields, no DELETE — ever** (§8).
- **receivables** — id, business_id, customer_id, sale_id (nullable — credit sales auto-create one; manual entries allowed), amount_minor, due_date, status (OPEN/PARTIAL/SETTLED/CANCELLED), notes, created_by.
- **payables** — mirror of receivables against supplier_id (source: purchases/manual).
- **receivable_settlements** — id, receivable_id, transaction_id (the INCOME payment), amount_minor, created_by. Allocation table: supports partial payments and one payment covering several receivables.
- **payable_settlements** — mirror, linking payables to EXPENSE transactions.

Settled amounts are **derived**: `sum(settlements)` per receivable; `status` is updated transactionally alongside settlement insert but is always recomputable from the ledger.

### Sales & inventory
- **products** — id, business_id, name, sku (nullable, unique per business), unit (piece/kg/…), cost_price_minor, selling_price_minor, low_stock_threshold, track_inventory (bool — service businesses sell non-stocked items), status (ACTIVE/ARCHIVED).
- **sales** — id, business_id, customer_id (nullable — walk-in), status (COMPLETED/REVERSED), payment_type (PAID/CREDIT/PARTIAL), total_minor, amount_paid_minor, occurred_at, notes, idempotency_key (partial unique per business), created_by, reverses_sale_id (nullable).
- **sale_items** — id, sale_id, product_id, quantity (NUMERIC(12,3) — supports kg), unit_price_minor, line_total_minor.
- **inventory_movements** — id, business_id, product_id, movement_type (PURCHASE/SALE/RETURN_IN/RETURN_OUT/ADJUSTMENT/DAMAGE), **quantity_delta** (signed NUMERIC(12,3)), unit_cost_minor (nullable), sale_id / reference (nullable), reason (required for ADJUSTMENT/DAMAGE), created_by, occurred_at. **Append-only ledger; stock is its sum.**
- `products.current_stock` — denormalized cache column updated in the same DB transaction as each movement insert; invariant: always equals `sum(quantity_delta)`; a reconciliation query in the test suite proves it.

### Parties
- **customers** — id, business_id, name, phone, email, address, notes, status. Outstanding balance is **derived** (open receivables), never stored.
- **suppliers** — mirror of customers; outstanding payable derived.

### AI & research (schema reserved now; implemented Phase 3)
- **ai_conversations** — id, business_id, user_id, title, status, last_message_at.
- **ai_messages** — id, conversation_id, role (USER/ASSISTANT/SYSTEM/TOOL), content, context_snapshot (JSONB — the exact metrics shown to the AI, for explainability/audit), token_usage, created_at.
- **research_requests** — id, business_id, user_id, query, status (PENDING/RUNNING/COMPLETED/FAILED), result (JSONB with sources), provider, created_at, completed_at.

### Cross-cutting
- **audit_events** — id, business_id (nullable — login events precede tenancy), actor_user_id, action (enum, §22), entity_type, entity_id, metadata (JSONB, no secrets), ip, created_at. Append-only; no FK cascade deletes.

**Deliberately absent:** `business_metrics` snapshot table — analytics computes on demand from the ledgers (§13); persisting snapshots is a documented later optimization, and adding the table now would create a second source of truth to keep honest. `roles` table — roles are a checked enum until custom roles are a real requirement. `inventory` as a separate table — movements + cached stock make it redundant.

**Relationships (summary):** user →(business_members)→ business →(1:N)→ everything tenant-owned. sale →(1:N) sale_items; sale →(0:N) inventory_movements, →(0:1) transactions (income), →(0:1) receivables (credit portion). receivable →(0:N) settlements → transactions. product →(1:N) inventory_movements. transaction →(0:1) reversal transaction.

**Key indexes:** every FK; `(business_id, occurred_at DESC)` on transactions, sales, inventory_movements (the hot dashboard paths); `(business_id, status)` on receivables/payables; partial unique idempotency indexes.

---

## 5. Multi-Tenancy & Isolation

Model: **shared database, shared schema, `business_id` discriminator** — the right cost/isolation trade-off at this scale (schema-per-tenant is operational pain; database-per-tenant is unjustified at this stage).

Enforcement is layered so one forgotten check is not a breach:

1. **URL shape**: all tenant resources live under `/api/v1/businesses/{business_id}/…`. Tenant context is explicit, never inferred from the user.
2. **Tenant guard dependency**: one FastAPI dependency (`require_membership(min_role)`) runs on every tenant route — resolves the JWT user, loads the ACTIVE membership for `{business_id}`, rejects with 404 (not 403 — don't confirm a business exists) if absent. Handlers receive a verified `TenantContext(business, membership, user)`.
3. **Repository discipline**: every tenant-scoped repository method requires `business_id`; every query filters on it. Fetch-by-id is always `WHERE id = :id AND business_id = :bid` — a manipulated resource ID belonging to another tenant yields 404. Enforced by convention + a test-suite sweep that hits every endpoint with a foreign-tenant token (§29).
4. **No cross-tenant joins** anywhere in application code.

PostgreSQL Row-Level Security is the documented hardening step (the schema is RLS-ready since every row carries `business_id`) but is **not** enabled in v1 — it complicates connection pooling and migrations for a guarantee layers 1–3 already provide, and can be added without schema change.

---

## 6. Users, Roles & Authorization

**Roles now: OWNER, ADMIN, STAFF.** MANAGER and ACCOUNTANT are deferred — with no feature that distinguishes them from ADMIN/STAFF yet, they would be decorative. The enum makes adding them a one-line migration.

| Capability | OWNER | ADMIN | STAFF |
|---|---|---|---|
| Record sales, expenses, inventory movements, customer/supplier payments | ✓ | ✓ | ✓ |
| View dashboard & analytics | ✓ | ✓ | ✓ |
| Reverse transactions/sales; manage products, categories, customers, suppliers | ✓ | ✓ | – |
| Manage members & roles; edit business profile | ✓ | ✓ (not OWNER role) | – |
| Delete/archive business; transfer ownership | ✓ | – | – |

Enforcement is **backend-only**: the tenant guard checks minimum role; services re-check for sensitive operations (defense in depth). Frontend role checks, when they arrive in Phase 4, are UX sugar with zero security weight. Exactly one OWNER per business in v1 (simplifies ownership transfer logic); the schema doesn't forbid more later.

---

## 7. Financial Data Model — Money Representation

**Decision: integer minor units (`BIGINT amount_minor`) + ISO currency code, one currency per business (the business's `currency`).**

Why integers, not NUMERIC or floats:

- Floats are banned outright — 0.1 + 0.2 ≠ 0.3 is disqualifying for a ledger.
- NUMERIC + Python `Decimal` is *correct* but leaks rounding/serialization decisions across every boundary (JSON, ORM, tests). Integer minor units make every amount exact by construction, arithmetic native and fast, and JSON-safe (SLE amounts fit comfortably in 53-bit JS integers; the API also emits a formatted display string so clients never do money math).
- Constraints: `amount_minor > 0` on transactions (direction comes from `type`, not sign — no ambiguous negatives in the ledger); currency on every money-bearing row must equal the business currency (service-enforced). Multi-currency is out of v1 scope; the column's existence is the extension seam (validated in §7.1).
- The single place minor↔display conversion happens is `common/money.py` (currency exponent map: SLE = 2). Percentages/ratios (margins, growth) are computed in `Decimal` server-side and returned as strings/scaled numbers — never recomputed by the client.

Transaction model: as specified in §4 — id, business, type, status, amount, currency, category, description, occurred_at (user-stated business date) vs created_at (system time), reference, counterparty, provenance (`source`), creator, reversal link, idempotency key. `occurred_at` may be backdated (real businesses catch up on records); `created_at` never lies — analytics uses `occurred_at`, audit uses `created_at`.

### 7.1 Monetary model validation (SLE) — the financial foundation, checked

**Currency identity.** The current Sierra Leonean currency is the redenominated leone, ISO 4217 code **SLE** (numeric 925), introduced in the 1 July 2022 redenomination at 1,000 old leones (SLL) to 1 new leone. SLL has been retired from ISO 4217 (amendments 171/172). MI YONE stores and transacts **SLE only**; the code `SLL` is rejected at validation so legacy figures can never silently mix with new-leone figures at a 1000× error.

**Exponent & storage.** ISO 4217 defines SLE with **minor unit 2** (cents; coins denominated in cents exist post-redenomination). Therefore `amount_minor` stores **SLE cents**: Le 1,500.00 → `150000`. Even though everyday cash prices in Sierra Leone are typically whole leones, we keep the ISO exponent rather than storing whole leones, because (a) it is the standard any future integration (Orange Money, banks, card rails) will speak, (b) unit prices and averages legitimately produce cents, and (c) it makes SLE just one entry in the currency-exponent map instead of a special case. `common/money.py` owns that map; no other code may assume an exponent. BIGINT headroom check: max ≈ 9.2 × 10¹⁸ minor units ≈ Le 92 quadrillion — no realistic overflow, including future currencies with exponent 3.

**Display formatting.** One server-side formatter, mirrored verbatim by the frontend from the API's `display` string — clients never format money themselves. Rules: symbol **Le** with thousands grouping (`Le 1,500`); decimals shown only when the fractional part is non-zero (`Le 1,500.50`) — matching how Sierra Leonean users actually read prices while never hiding real cents; negative amounts never appear in ledger displays (direction is expressed by type/labels, matching the sign-free ledger).

**Rounding policy (single, global).** All arithmetic on amounts is exact integer math; rounding exists only where division/multiplication forces it, is always **half-up (commercial rounding)** to the currency's minor unit, and happens **once, at the final step — never on intermediates**. Concretely: `line_total = round_half_up(quantity × unit_price_minor)` per sale line (quantities allow 3 dp for kg-type units), and `sale.total = Σ line_totals` — summing already-rounded lines so the total always equals what the customer sees line by line (no re-rounding drift). Ratios (margins, growth) are computed in Python `Decimal` from the integer sums and quantized only at presentation (one decimal place, e.g. `23.4%`). Half-up is chosen over banker's rounding because it matches human/commercial expectation and the amounts involved make bias statistically irrelevant; the choice is centralized in `common/money.py` and unit-tested with adversarial cases (`.005` boundaries, 3-dp quantities, zero denominators).

**Profit margin definition.** `margin = (revenue − expenses) / revenue`, `Decimal`, guarded for `revenue = 0` (returned as null, displayed as "—", never as 0% — a business with no revenue has an undefined margin, not a zero one).

**Inventory costing.** v1 values stock at **latest cost price** and labels the figure *estimated* — honest and simple. The committed upgrade is **weighted-average cost (WAC)**, and the schema already carries everything WAC needs (`inventory_movements.unit_cost_minor` on purchases), so the upgrade is a calculation change, not a migration. FIFO is explicitly deferred (accounting-grade complexity with no v1 payoff). Until WAC lands, "profit" from analytics is *cash profit* (revenue − expenses), not gross margin per product; the UI must not imply per-product profit precision the costing model doesn't have.

**Multi-currency compatibility (design-proof, not built).** Every money-bearing row already carries its currency; the exponent map is data, not code; aggregates in analytics group by currency (trivially single-group today, enforced by the business-currency invariant); and cross-currency totals are defined as *impossible without an explicit conversion step* — a future `fx_rates` table and a conversion service are the seam. Nothing in v1 hard-codes "2 decimals" or "SLE" outside `common/money.py` and the validation layer. When multi-currency arrives, the invariant "row currency = business currency" relaxes per-module; nothing else moves.

---

## 8. Financial Integrity

**Transactions are immutable.** The API offers no update or delete of financial fields on a POSTED transaction. Corrections follow accounting practice:

- **Reversal**: `POST …/transactions/{id}/reverse` (ADMIN+, reason required) creates a new opposing transaction with `reverses_transaction_id = target`, sets the target's status to REVERSED, and writes an audit event — all in one DB transaction. The unique constraint on `reverses_transaction_id` prevents double-reversal.
- **Correction** = reversal + new correct transaction (the service exposes this as one "correct" operation client-side, still two ledger rows).
- **Sales reversal** cascades correctly: reversing a sale reverses its income transaction, emits compensating RETURN_IN inventory movements, and cancels/adjusts its receivable — atomically.
- Reversals are never themselves reversed (re-enter the original instead) — keeps chains one level deep and auditable.
- Non-financial metadata (description typo, category) — v1 treats category as financial (it drives expense analytics), so changing it is also reversal+recreate. Only `description` may be edited in place, and even that writes an audit event. This is stricter than typical CRUD apps, deliberately: the ledger's credibility is the product.
- **Reproducibility**: every displayed number must be recomputable from `transactions` + `inventory_movements` + settlement tables alone. Cached columns (`current_stock`, receivable `status`) are conveniences with reconciliation tests, never sources of truth.
- **Idempotency**: §21.

---

## 9. Financial Calculations (Authoritative, Backend-Only)

All of the following are computed by `analytics` (and `finance`) services from the ledgers; the frontend only displays them:

- Revenue = Σ INCOME transactions in period where status = POSTED and `reverses_transaction_id IS NULL`. Reversal semantics for analytics: the reversed original (status REVERSED) and its reversal row are **both excluded** from metric sums — the reversal row exists for the audit trail, not the totals. This means correcting a past mistake retroactively fixes that period's reported numbers, which is the honest behavior a small business expects (period-preserving contra entries are an accounting-grade upgrade documented for later, not v1).
- Expenses = same rule over EXPENSE transactions.
- Profit = revenue − expenses; margin = profit / revenue.
- Cash flow (v1 definition, stated honestly in the UI later): cash in − cash out per period, where credit sales count when *settled*, not when booked. Booked-vs-cash distinction is exactly what receivables/settlements give us.
- Outstanding receivables/payables = Σ open amounts − settlements.
- Inventory value = Σ over products of current_stock × cost_price (weighted-average costing is the documented upgrade; v1 uses latest cost price and labels the figure "estimated" — see §7.1).
- Growth rates = (current − previous) / previous per period, guarded for zero denominators.

`GET /analytics/…` endpoints return these plus the inputs used (period, counts), so the AI layer and dashboard consume identical, explainable numbers.

---

## 10. Inventory Architecture

No naked `product.stock = 50` writes, ever. Stock is a ledger:

```
inventory_movements (append-only, signed quantity_delta)
        ↓  same-transaction cache update
products.current_stock  (invariant: = Σ deltas; reconciliation-tested)
```

Movement types: PURCHASE(+), SALE(−), RETURN_IN(+), RETURN_OUT(−), ADJUSTMENT(±, reason required), DAMAGE(−, reason required). TRANSFER is deferred until multi-location exists (the type enum extends trivially). Purchases with a supplier create the movement + an EXPENSE transaction + optionally a payable — one service operation. Negative-stock sales are allowed with a warning flag rather than blocked (real shops sell items the ledger missed; blocking causes users to abandon the record — worse for data quality), surfaced in "Attention Needed".

---

## 11. Customers

Customer profile (contact, notes) + everything else derived: transaction history via counterparty link, outstanding balance via open receivables, payment records via settlements. No pipeline stages, no lead scoring, no CRM ambitions. Merge/dedupe is out of scope; archive instead of delete (history must survive).

## 12. Suppliers

Exact mirror: profile + purchase history (PURCHASE movements + EXPENSE transactions) + outstanding payables derived. Same archive-not-delete rule.

---

## 13. Analytics Architecture

```
Ledgers (transactions · movements · settlements)
   ↓  read-only SQL aggregates (analytics/queries.py)
Analytics Service  →  deterministic metrics + period comparisons
   ↓                                  ↓
Dashboard API                    AI Context (Phase 3)
```

- **Computed on demand** with indexed aggregate queries. At v1 volume (thousands of rows per business) this is milliseconds; pre-computed snapshot tables/materialized views are the documented scaling step (§31 of Phase 2 → scalability), added only when p95 latency says so.
- Endpoints: summary (revenue/expenses/profit/margin + deltas vs previous period), cash-flow series, category breakdown, top products, sales trend, receivables/payables aging, inventory status, and one composite `GET /analytics/dashboard` that the dashboard calls **once** (no request fan-out) — including the `attention` array (low stock, overdue receivables, unusual expense categories vs trailing average, negative-stock flags). That array *is* the v1 notification system.
- The insight layer stays deterministic: rules produce structured facts ("Transport expenses are 240% of 3-month average"); Phase 3's AI turns facts into prose. AI never computes a metric.

---

## 14–15. API Architecture & Response Design

REST, versioned at `/api/v1`. Tenant resources nested under the business:

```
/api/v1/auth            POST /register /login /refresh /logout
                        POST /password-reset/request /password-reset/confirm
                        POST /verify-email        GET /me
/api/v1/businesses      GET(list mine) POST ·  GET/PATCH /{bid}
                        GET/POST /{bid}/members · PATCH/DELETE /{bid}/members/{id}
/api/v1/businesses/{bid}/
  transactions          GET(filtered,paginated) POST · GET /{id} · POST /{id}/reverse
  categories            GET POST PATCH /{id} (archive, not delete)
  sales                 GET POST · GET /{id} · POST /{id}/reverse
  products              GET POST · GET/PATCH /{id} (archive)
  inventory/movements   GET POST            (adjustment/damage/purchase entry)
  customers, suppliers  GET POST · GET/PATCH /{id} (archive)
  receivables           GET POST · GET /{id} · POST /{id}/settlements
  payables              GET POST · GET /{id} · POST /{id}/settlements
  analytics             GET /dashboard /summary /cash-flow /categories
                        GET /products/top /receivables/aging /payables/aging
  ai, research          reserved — mounted in Phase 3
/health /readiness      unversioned, unauthenticated
```

No DELETE on financial or history-bearing resources — archive/reverse semantics only. No endpoints created just because CRUD exists (e.g. no PATCH on transactions, no DELETE on members' history).

**Envelope** (every response, uniform):

```json
{ "success": true,  "data": { … }, "meta": { "page": 1, "per_page": 25, "total": 118 } }
{ "success": false, "error": { "code": "TENANT_NOT_FOUND", "message": "Business not found.",
                               "details": [{ "field": "amount_minor", "issue": "must be > 0" }] } }
```

Stable machine error codes (VALIDATION_ERROR, AUTH_REQUIRED, AUTH_INVALID, PERMISSION_DENIED, TENANT_NOT_FOUND, NOT_FOUND, CONFLICT, IDEMPOTENCY_REPLAY, RATE_LIMITED, INTERNAL_ERROR); human messages are frontend-friendly and never contain stack traces, SQL, or internal paths. A global exception handler maps domain errors → codes; unexpected exceptions log with request-id and return only INTERNAL_ERROR + the request-id for support. Pagination: `page`/`per_page` (max 100) — offset pagination is fine at v1 scale; cursor pagination is the documented upgrade for large histories. Filtering on list endpoints: date range, type, category, counterparty, status.

---

## 16. Validation

Four layers, none optional: **Pydantic** at the boundary (types, required fields, lengths, ranges, date sanity, enum membership, amount > 0 and ≤ a sanity cap); **service invariants** (category kind matches transaction type, counterparty belongs to tenant, settlement ≤ outstanding, movement reason present when required, currency matches business); **tenancy/permission** via the guard (§5, §6); **database constraints** as the last line (FKs, CHECKs, unique/partial-unique). Every cross-entity reference in a request body (category_id, customer_id, product_id…) is verified to belong to the same `business_id` — this is the classic IDOR hole and it is closed at the service layer with a shared helper. Frontend validation is UX only.

---

## 17. Authentication

- **Registration**: email (+ optional phone) + password. Argon2id hashing (`argon2-cffi`) — current best practice, memory-hard. Password policy: length ≥ 10 + breached-password denylist top-N; no composition-rule theater.
- **Session mechanism — evaluated, not assumed.** Because MI YONE holds business financial data, the token architecture deserves an explicit comparison rather than a default to JWT:

  | Criterion | **A: Server-side opaque sessions** (random token, hashed in `auth_sessions`, HttpOnly cookie / bearer) | **B: JWT access (15 min) + rotating refresh token** |
  |---|---|---|
  | Revocation | **Immediate** — delete the row; fired employee or stolen device is out *now* | Access token stays valid until expiry (up to 15 min of unrevokable access to financial data) unless a denylist is added — which reintroduces the DB lookup JWT exists to avoid |
  | Statelessness value | None needed — we are one monolith, one DB; the session lookup is a single indexed read (~sub-ms), cacheable later | Real value only when many services verify tokens without a shared store — a problem MI YONE does not have and may never have |
  | Complexity & failure modes | Minimal, decades-proven; nothing to misconfigure | Larger surface: algorithm confusion, key rotation, clock skew, claim staleness, refresh-rotation + reuse-detection logic |
  | Stale authorization | Impossible — every request reads live state | Mitigated only by keeping roles out of the token (which we would do anyway — §6) |
  | Multi-client (future mobile app) | Works identically as a bearer token | Works; JWT's usual selling point, but equally true of opaque tokens |
  | Future service extraction | Introduce JWT *then*, at the gateway, with real requirements known | Pre-pays that cost now, on guesses |

  **Recommendation: Option A — server-side opaque sessions.** The honest observation is that our own JWT design already required a server-side `auth_sessions` table for refresh rotation, so the "stateless" benefit was largely fiction; Option A keeps the same table and deletes the JWT machinery on top of it. For a financial product, instant revocation and a smaller attack surface beat a stateless property we wouldn't be using. Sliding expiry: sessions live 30 days, extended on use, absolute cap 90 days; hashed at rest; per-device rows; "log out everywhere" = delete all rows for the user.
  **✅ OWNER DECISION: Option A — server-side opaque sessions — APPROVED.** M1 is unblocked; the session design above (hashed opaque tokens, sliding 30-day expiry, 90-day cap, per-device rows, log-out-everywhere) is now the binding authentication architecture.
- Delivery (either option): HttpOnly Secure SameSite=Lax cookie for the browser (CSRF-safe by cookie policy + no state-changing GETs, plus origin checks on mutations), Authorization bearer header for non-browser clients.
- **Verification & reset**: single-use hashed tokens with expiry (`verification_tokens`); email delivery is a console/log stub behind a `NotificationPort` until a real provider is configured — the flow is real, the transport is swappable. Reset invalidates all sessions.
- **Rate limiting** on `/auth/*`: per-IP and per-identifier sliding window (in-process store now; Redis later, §24). Account lock after repeated failures with audit event. Uniform "invalid credentials" errors — no user enumeration (registration conflicts return the same generic flow).
- **MFA**: schema-ready (`mfa_enabled`), not implemented — a documented Phase 5 hardening item.

---

## 18. Security Boundaries

| Boundary | Controls |
|---|---|
| Browser → API | TLS only; JWT/session auth; tenant guard; Pydantic validation; rate limits; CORS locked to the frontend origin; security headers; request-id logging (no bodies with financial detail at INFO) |
| API → Database | Credentials from env only; parameterized queries via SQLAlchemy (no string SQL); least-privilege DB user (no SUPERUSER; migrations run with a separate role); TLS in managed environments |
| API → AI provider (Phase 3) | Only the approved context payload (§19) — never credentials, password hashes, full customer PII dumps, or raw tables; provider keys server-side env only; usage logged per business |
| API → Research provider (Phase 3) | Query + minimal context; results stored with sources; same key hygiene |
| MI YONE → future financial providers | Exists only as the `integrations` port + MockProvider; credentials-handling design deferred to the phase that implements a real one — designing secret storage for imaginary APIs now is guesswork |

---

## 19. AI Data Boundary (design now, build Phase 3)

```
PostgreSQL → Analytics/Business services → BusinessContextService
    → approved, minimized context (metrics + facts, per-request)
    → AIService → AIProvider interface → Claude/OpenAI/…
```

Hard rules baked into the design: the AI layer has **no database session** — it can only call `BusinessContextService`, which exposes a fixed catalog of context builders (financial summary, top products, receivables aging, inventory status…), each scoped by the caller's verified `TenantContext`. No AI-generated SQL against production data, ever; "tool calling" in Phase 3 means the model selects from this same fixed catalog. Context is minimized per task (an expense question doesn't ship the customer list) and the exact snapshot sent is stored on the `ai_messages` row — explainability and audit in one column. Provider abstraction:

```python
class AIProvider(Protocol):
    async def complete(self, messages, tools=None, …) -> AIResult: ...
# ClaudeProvider · OpenAIProvider · FakeProvider (tests)
```

### 19.1 "AI memory" is four different things — never one vague concept

The word "memory" is banned as a design term in this codebase; each of these is named, stored, and governed separately:

1. **Conversation history** (`ai_conversations` / `ai_messages`) — the transcript of one conversation, replayed into context for continuity *within that conversation only*. It is a chat log, not a knowledge store: nothing in it is treated as a durable fact about the business, and old conversations are never silently mined into new ones. Retention/deletion is user-controlled.
2. **Business memory** (future `business_memory` table, AI phase) — durable, *intentional* facts about the business: goals, strategy, priorities, plans ("we want to open a second location by December"). Written only through explicit capture ("should I remember this goal?") or direct user entry — never accumulated silently from chat. Fully visible, editable, and deletable by the user in settings; scoped to the business, not the user; included in AI context only when relevant to the task. This is the philosophy of the product applied to the AI: the owner owns it.
3. **User preferences** — how the AI communicates with *this user*: language, tone, verbosity, format. Plain settings on the user profile, applied mechanically; nothing learned, nothing inferred, nothing hidden.
4. **Long-term AI memory** (cross-conversation learned context) — **deferred indefinitely.** If it ever exists, it must pass the same bar as business memory: intentional, visible, editable, minimal. Automatic accumulation of inferred facts is rejected on principle for a financial product.

`context_snapshot` on `ai_messages` belongs to **none** of these — it is an audit artifact (exactly which computed metrics the AI was shown for that reply), never re-fed as memory. The full design of items 2–4 is an AI-phase deliverable; Phase 2 only guarantees the schema and this taxonomy prevent "memory" from growing into an undefined blob.

---

## 20. Future Financial Integrations

`integrations/financial_provider.py` defines the port (fetch balance/transactions for an authorized external account — read-model only for now); `MockProvider` implements it with clearly-labeled synthetic data (`"source": "mock"` on every record, and mock data never enters the `transactions` ledger — it can only be displayed as a demo overlay). No Orange/bank code, no fake OAuth screens, no pretend production capability. When a real partnership lands, it becomes `OrangeProvider` behind the same port plus its own credential design.

---

## 21. Idempotency

Client-generated `Idempotency-Key` header (UUID) accepted on the money-creating POSTs — transactions, sales, settlements. Stored on the row; partial unique index on `(business_id, idempotency_key)`; a replay returns the original resource with `IDEMPOTENCY_REPLAY` semantics (200, same body) instead of a duplicate. This matters *now* (Sierra Leone mobile networks retry; double-tapped submit buttons duplicate ledger rows) and is the exact mechanism future payment webhooks will need — external event IDs become idempotency keys. Keys are advisory-optional in the API contract but the Phase 4 frontend will always send them.

## 22. Audit Logging

Append-only `audit_events`, written by services (same DB transaction as the action for financial events). Audited: login success/failure, logout-all, password reset; business create/archive; member invite/role-change/removal; transaction create/reverse; sale create/reverse; settlement create; inventory adjustment/damage; category changes; description edits. Metadata JSONB holds before/after for mutations — never passwords, tokens, or full PII. Queryable by ADMIN+ later (`GET /{bid}/audit`, Phase 5); storage-first now. No secrets, no request bodies verbatim.

## 23. Background Jobs

**Decision: no job queue in Phase 2.** Everything in scope is a fast synchronous DB operation; a queue would be infrastructure without a customer. FastAPI `BackgroundTasks` covers fire-and-forget email stubs. The seams are ready: research requests already have PENDING/RUNNING status (born async-shaped), and when Phase 3 AI/research or report generation needs real workers, **arq** (Redis-based, async-native, minimal) is the pre-selected tool — chosen over Celery for footprint and asyncio fit. That is the single trigger for introducing Redis.

## 24. Caching

**None in Phase 2**, including no Redis. Indexed aggregates over v1-scale data don't need it, and caching financial figures risks showing stale money — the worst possible bug for a trust product. In-process TTL cache is permitted only for static reference data. Redis enters when arq does (§23), and response caching gets considered only with p95 evidence.

## 25. File Storage

**Deferred.** Nothing in Phase 2/3 scope requires files (receipts, exports, report PDFs are Phase 4+ candidates). A five-line `StoragePort` protocol (put/get/delete/url) is defined in `integrations/` so nothing couples to a filesystem or S3 SDK by accident; first implementation ships with the first feature that needs it.

## 26. Observability

Structured JSON logs (structlog): timestamp, level, request-id, user-id, business-id, route, status, duration — request-id returned in responses and echoed in error envelopes. `GET /health` (process up) and `GET /readiness` (DB reachable, migrations current). Error-tracking hook (Sentry-compatible) wired but env-gated. Metrics/tracing (Prometheus/OTel) are deferred with clean seams — the logging middleware is where they'd attach. Audit (§22) covers the security-events lane.

## 27. Migrations

Alembic from the first table. Every schema change is a versioned, reviewed, reversible-where-possible migration; production changes run only through it; CI runs `alembic upgrade head` against a fresh PostgreSQL on every push (catches drift and broken migrations immediately). Data migrations live in the same stream, written idempotently. No manual production DDL, no exceptions.

## 28. Configuration

`pydantic-settings` loading from environment; typed, validated at startup (fail fast on missing DATABASE_URL/SECRET_KEY etc.). `.env` git-ignored; `backend/.env.example` documents every variable with placeholders (DATABASE_URL, JWT_SECRET, JWT_ACCESS_TTL, REFRESH_TTL, CORS_ORIGINS, ENV, LOG_LEVEL, AI_PROVIDER/AI_API_KEY [Phase 3], SENTRY_DSN [optional]). Secrets never in code, never in Git history, never logged. Separate settings profiles for dev/test/prod via `ENV`.

## 29. Test Architecture

pytest + httpx AsyncClient against the app; real PostgreSQL in tests (Dockerized, per-suite schema; SQLite is banned — its type behavior lies about money and constraints). Factories for entities; each test in a rolled-back transaction for speed.

Coverage priorities (in order): **(1) Financial correctness** — analytics math, reversal cascades, settlement allocation, idempotency replay, stock reconciliation, backdating behavior: exhaustive unit + service tests, including property-style checks (Σ ledger == reported totals). **(2) Authorization** — an automated sweep that calls *every* registered tenant endpoint as: unauthenticated, wrong-tenant member, and under-privileged role — expecting 401/404/403; new endpoints fail this sweep by default until covered. **(3) Auth flows** — registration, login, logout, password reset, and the revocation semantics of whichever mechanism §17's pending decision selects. **(4) API contract** — envelope shape, error codes, validation messages. Integration tests cover the cross-module orchestrations (credit sale → transaction + movement + receivable; sale reversal cascade). CI gate: ruff + mypy + full suite green before merge.

## 30. Documentation Plan

`docs/`: `architecture.md` (this document, maintained), `database.md` (entity map + invariants), `api.md` (conventions; OpenAPI is auto-generated by FastAPI and kept accurate by the schemas themselves), `auth.md`, `testing.md`, `setup.md` (clone → docker compose up → migrate → seed → run in <10 minutes), `decisions/` (short ADRs — every "why" in this document becomes ADR-001…n so future developers inherit reasoning, not just structure). READMEs stay thin and point into `docs/`.

---

## 31–32. Implementation Sequence & Milestones

Order follows the dependency spine; each milestone is small, testable, and independently reviewable. **Goal / DB / API / Tests / Acceptance** per milestone:

- **M0 — Foundation.** Repo layout, FastAPI skeleton, settings, envelope + error handler, logging, health/readiness, Docker Compose (api+postgres), Alembic wired, CI (lint/type/test/migrate). *Accept:* fresh clone to running `/health` in <10 min; CI green.
- **M1 — Identity.** users/auth_sessions/verification_tokens migrations; register/login/logout/reset (stub transport) using server-side opaque sessions per the approved §17 decision; rate limiting; audit events for auth. *Accept:* auth flow tests green incl. immediate revocation; no user enumeration.
- **M2 — Business & tenancy.** businesses/business_members; create/list/update; member invite + roles; tenant guard dependency; authorization test sweep harness. *Accept:* cross-tenant probes return 404 on every existing endpoint.
- **M3 — Finance core.** categories (seeded defaults) + transactions; create/list/filter/reverse; idempotency; immutability enforced; audit. *Accept:* reversal + replay tests green; no update/delete path exists.
- **M4 — Products & inventory.** products + movements + cached stock; purchase/adjustment/damage entry. *Accept:* stock reconciliation property test green; reasons enforced.
- **M5 — Customers & suppliers.** CRUD (archive semantics), counterparty links on transactions. *Accept:* derived balances correct against fixtures.
- **M6 — Sales.** sale + items orchestration → transaction + movements + (credit) receivable, atomically; sale reversal cascade. *Accept:* integration tests for PAID/CREDIT/PARTIAL and reversal; idempotent.
- **M7 — Receivables & payables.** Manual entries, settlements with allocation, aging queries. *Accept:* over-settlement rejected; partial flows correct.
- **M8 — Analytics.** queries + service + endpoints incl. composite dashboard + attention rules. *Accept:* every metric matches hand-computed fixtures; dashboard is one round-trip; p95 < 300 ms on seeded 10k-row tenant.
- **M9 — Hardening pass.** Security review vs §16–§18 checklist, authorization sweep at 100%, seed/demo data command (clearly non-production), docs complete, deployment dry-run.
- *(Phase 3: AI + research on the reserved schema/ports. Phase 4: frontend. Phase 5: deploy hardening, MFA, audit UI.)*

**Deployment strategy (target, not executed now):** single Docker image; managed PostgreSQL with automated backups + tested restore; one small VM or PaaS (Railway/Render/Fly-class) behind TLS; migrations run on release before traffic; env-injected secrets; daily backup verification. No Kubernetes — a focused production product needs reliability, not orchestration.

---

## 33. Risks & Trade-offs (Phase 2 scope)

| Risk / trade-off | Level | Position |
|---|---|---|
| Tenant isolation bug leaks another business's finances | CRITICAL | Layered guard + repository convention + mandatory adversarial test sweep; RLS as later hardening |
| Financial math wrong → product credibility dies | CRITICAL | Integer money, append-only ledgers, derived-value reconciliation tests, exhaustive M3/M8 fixtures |
| Strict immutability (reversal-only edits) may annoy users used to freely editing records | MEDIUM | Accepted deliberately; Phase 4 UX must make "correct" a one-tap flow so rigor doesn't feel like punishment |
| On-demand analytics slows at scale | LOW now | Indexes + single composite endpoint; snapshot tables are a ready, additive upgrade |
| No queue/Redis/files yet — Phase 3 needs could force infra mid-flight | LOW | Seams pre-cut (async-shaped research, arq pre-selected, StoragePort defined); adding is additive, not surgical |
| Single-currency assumption | LOW | Currency column everywhere; multi-currency is schema-compatible later |
| Kiro may hold an unseen scaffold that conflicts with this design | MEDIUM | First act of Phase 3: connect the folder, diff, reconcile — never overwrite blind |
| Offset pagination on huge histories | LOW | Capped page size; cursor upgrade documented |
| Backend rigor leaks into the UX as complexity (ledgers, reversals, idempotency visible to users) | HIGH | §34 — simplicity is a first-class requirement of the next phase, with the affordances below already reserved for it |

---

## 34. The Simplicity Mandate (the bridge to the next phase)

The unanswered question of this architecture is not technical: **how does all of this feel effortless to an ordinary business owner?** A beautiful backend and a complicated product is a failed product. Phase 2 cannot answer this fully — that is the next phase's job — but the architecture was shaped so that simplicity is *possible*, and this section records the obligations it hands to the UX phase.

What the architecture already does in simplicity's favor: the dashboard is **one** API call answering "how is my business doing?", including the attention list — no widget zoo required. Idempotency keys silently absorb double-taps and network retries — the user never sees a duplicate. Negative stock warns instead of blocking — the record always wins. Categories come pre-seeded — no setup homework before the first expense. Derived balances mean the user never reconciles anything by hand.

What the UX phase must now deliver on top: **vocabulary translation** — users must never see the words ledger, reversal, idempotency, receivable, settlement; they see "money in", "money out", "fix this record", "owes you", "mark as paid". The immutable-ledger discipline (§8) must surface as a one-tap "Fix" that quietly performs reversal + re-entry — rigor as a feature, invisible as a mechanism. **The ten-second sale**: recording a sale — the most frequent action — must be faster than writing it in a notebook, or the notebook wins. **Empty states that teach**: day one shows one next action, not twelve zeroed metrics. **Mobile-first, low-bandwidth, plain language** (and language-ready for Krio), because the target user is on a phone in a shop, not at a desk.

Acceptance principle for the next phase: every screen answers one question a business owner actually asks; any feature that cannot be explained in one sentence of shop-floor language goes back to design.

---

*End of Phase 2 design (Rev 2). STOP — awaiting approval before any implementation (Phase 3+). Open decision blocking M1: session mechanism (§17).*
