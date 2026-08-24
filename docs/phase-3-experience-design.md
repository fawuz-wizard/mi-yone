# MI YONE — Phase 3: Experience Design

Status: DESIGN — no production frontend code, no screen implementation. This document defines the MI YONE experience the Phase 4 frontend will build.
Depends on: `claude/product-understanding.md`, `claude/phase-2-technical-architecture.md` (Rev 2, incl. §34 Simplicity Mandate — this document is its execution).
Objective, verbatim: **make powerful business intelligence feel simple.**
Rev 2 — **APPROVED by the owner with six adjustments, all incorporated below**: (1) color palette is a hypothesis, not branding — §16; (2) "Partner" is a working name — §5; (3) the ownership philosophy must be *felt* in the UX — §1.1; (4) cash vs profit must never mislead — §6.1; (5) offline capture approved as a design requirement, implementation gated on a dedicated technical design — §8; (6) the Business Setup experience is a first-class design object — §19. Phase 4 charter added — §20.

---

## 1. Experience Vision & Design Principles

MI YONE should feel like a sharp, honest business partner who lives in the owner's pocket — not like software. The owner's mental model is a notebook plus a trusted advisor; ours must be no more complicated than that.

**Principles (every design decision is tested against these):**

1. **One screen, one business question.** If a screen can't name the question it answers, it doesn't ship.
2. **Recording beats browsing.** The product wins or loses on how fast money-in, money-out, and stock changes get captured. Capture is the front door; analysis is the reward.
3. **The complexity lives underneath.** Ledgers, reversals, idempotency, settlements — powerful, invisible. Never dumbed down, always hidden until needed (progressive disclosure).
4. **Speak shop-floor language.** Every label passes the test: "would a trader at a Freetown market say this?"
5. **Never lie, never dress up.** Estimated figures say "estimated". AI insights say where the numbers came from. Failed actions say what happened and what to do.
6. **Respect the network.** Slow or absent connectivity is the normal case, not the error case.
7. **Progress over polish.** The first week of use should feel like the business is getting more organized every day — visible, small wins.
8. **It belongs to the owner.** MI YONE means "My Own" — the interface must make the user feel *this is mine*, never *I am using someone's software*.

### 1.1 The Ownership Feeling (how "Own your money. Own your business. Own your decisions." becomes UX, not a slogan)

The philosophy is expressed through **grammar, control, and posture — never through printing the slogan on screens**:

- **Possessive language as the house voice.** The interface speaks in *your*: "Your money in", "Your stock", "Your customers", "You owe", "Owes you". Section subtitles and empty states reinforce it ("Track what's yours"). This is a §12-glossary-level rule, enforceable per screen — and it costs nothing.
- **The business's name is the identity of the app.** The header says **Mariama's Provisions**, not "MI YONE Dashboard". The product's brand recedes once you're inside; the user's brand takes the stage. (MI YONE's identity lives at the door — welcome, login, setup — and in the Partner's voice.)
- **Control is always visible and always the user's.** Everything recorded can be seen, everything seen can be traced ("see history"), everything the Partner knows is inspectable ("What the Partner can see"), every insight ends at *the user's* decision — the AI proposes, never prescribes ("You could…", never "You must…"). Settings states in plain words what is stored and why.
- **Decisions are framed as the owner's wins.** Insights and summaries attribute agency to the owner, not the app: "You cut transport costs 20% this month" — never "MI YONE saved you 20%".
- **Nothing is taken, hidden, or silently sent.** §13's transparency patterns are the ownership philosophy's proof, not a compliance feature.

Acceptance addition (feeds §17): every screen spec must answer — *where does this screen make the user feel ownership?* If the honest answer is "nowhere", the copy pass isn't done.

---

## 2. Personas

**P1 — Mariama, provisions shop owner (primary persona; we design for her first).**
Runs a shop in Freetown; sole decision-maker; serves customers while managing everything. Android phone, mobile data she pays for by the GB, patchy signal inside the shop. Keeps records in a notebook when she keeps them at all; gives regular customers goods on credit and tracks debts from memory. Comfortable with WhatsApp and Orange Money; has never used business software. Goals: know if she's actually making money, stop losing track of who owes her, know when to restock. Fears: complicated apps, losing her data, anything that feels like it's judging her record-keeping.
*Design consequence: every frequent action must be doable one-handed, mid-conversation, in seconds.*

**P2 — Ibrahim, building-materials trader with 2 staff.**
Higher volume, supplier credit both directions, staff record sales when he's away. Uses a phone in the yard, sometimes a laptop in the evening. Goals: trust the numbers his staff enter, see the day's takings from anywhere, know which products carry the business. Fears: staff errors or theft hiding in sloppy records.
*Design consequence: roles matter (STAFF can record, not erase); the "Fix" trail must be visible to him; evening desktop review is a real scenario.*

**P3 — Fatmata, freelance caterer/service provider.**
No physical stock for most jobs; income is lumpy; expenses spread across many small purchases. Goals: know what a job actually earned after costs, look professional when telling a client what they owe. Fears: apps built only for shops with shelves.
*Design consequence: products/stock must be optional, never a gate; a sale without inventory must be first-class.*

**Staff user (secondary):** records sales/expenses on the owner's business, sees only what their role allows, needs an even simpler capture experience and zero exposure to analytics they don't own.

---

## 3. User Goals & Top Jobs (frequency-ranked)

1. Record a sale (many times daily) → the ten-second sale (§7).
2. Record an expense (daily).
3. Glance: "how is my business doing today/this month?" (daily).
4. Check/record who owes me; mark a debt paid (weekly or on sight of the customer).
5. Check stock / record goods received (weekly).
6. Ask or receive: "what should I pay attention to?" (weekly).
7. Month review: profit, biggest expenses, best products (monthly).
8. Research: prices, suppliers, market (occasionally).

Navigation, dashboard, and interaction budgets are allocated in exactly this order. Anything serving job 8 may cost three taps; anything serving job 1 may cost one.

---

## 4. Core User Journeys (trigger → action → system response → result)

**J1 First run / onboarding.** Trigger: opens app after registering. → The Business Setup experience, designed in full in §19 (business name → type → currency confirmed → optional products → first record, with the labeled example-data option). → System seeds categories silently. → Result: a working business with one real record in under two minutes; the dashboard already answers something.
**J2 The ten-second sale.** §7 in full. Result: sale saved, stock decremented, credit tracked — user saw none of that machinery.
**J3 Record an expense.** Trigger: paid for stock/transport/rent. → "+ Money out" → amount (big keypad) → category (recent-first chips) → optional note/supplier. → Result: saved in ~3 taps; dashboard and categories update.
**J4 Fix a record.** Trigger: notices yesterday's sale was entered wrong. → Opens record → "Fix this record" → edits the wrong value in what looks like a normal edit form → confirm. → System performs reversal + re-entry invisibly; record shows "Fixed · see history"; the owner (P2) can expand history to see original → fix, who and when. → Result: books stay trustworthy; user experienced an edit.
**J5 Customer credit.** Trigger: regular customer takes goods, will pay Friday. → During sale: "Paid?" → "Owes you" (full or part, with amount paid now) → pick/add customer by name or phone. Friday: customer pays → open customer (or Money → Owed to you) → "Mark as paid" (full/part). → Result: receivable created and settled; the words "receivable" and "settlement" never appeared.
**J6 Goods received / restock.** Trigger: supplier delivery. → Stock → product → "Add stock" → quantity, cost (prefilled from last time), paid now or "You owe supplier". → Result: stock, expense, and payable recorded as one action.
**J7 Daily/weekly glance.** Trigger: opens app. → Home answers immediately: money in, money out, what needs attention. → Result: oriented in five seconds without tapping anything.
**J8 Ask the partner.** Trigger: curiosity or an insight card. → Assistant tab → taps a suggested question ("Why is my profit down?") or types/voice-inputs freely. → Answer in plain language with the actual numbers and "from your records" labeling. → Result: understanding, plus one suggested next action at most.
**J9 Research.** Trigger: considering stocking a new product. → Assistant → "Research" mode (explicitly separate) → asks → progress state ("Searching… this can take a minute") → result with sources, clearly marked "from the web, [date]" and separated from any business-data commentary. → Result: informed judgment, no fake certainty.
**J10 Month review.** Trigger: month end (and a gentle insight card: "Your January summary is ready"). → Insights → month summary: profit, vs last month, top products, biggest expense categories, money owed both ways. → Result: the monthly conversation an accountant would give — in two screens.
**J11 Invite staff (P2).** Trigger: wants staff to record sales. → Menu → Business → People → invite by phone/email, role explained in one sentence each. → Result: staff records; owner sees who recorded what on every entry.

---

## 5. Information Architecture & Navigation

**Mobile (the foundation): five-item bottom navigation + one primary action button.**

```
┌────────────────────────────────────────────┐
│                 (screen)                   │
│                                            │
│              ┌───────┐                     │
│              │  + Add │  ← floating, always │
│              └───────┘    present           │
├─────────┬────────┬────────┬───────┬────────┤
│  Home   │ Money  │ Stock  │Partner│  Menu  │
└─────────┴────────┴────────┴───────┴────────┘
```

- **+ Add** (the most important control in the product): opens a two-option sheet — **Money in** / **Money out** — with "Add stock" and "New product" as secondary options. One thumb, from anywhere.
- **Home** — "How is my business doing?" (dashboard, §6).
- **Money** — "What came in, what went out, who owes who?" Tabs/segments: All · In · Out · **Owed to you** · **You owe**. (Customers-as-debtors live here where the money question is asked; full customer profiles live under Menu → deliberate: debt is a money question, not a contacts question.)
- **Stock** — "What do I have and what's running low?" Products list with stock levels, low-stock first; product detail = price, stock history in plain words ("Added 50 · Sold 3 · Adjusted −1 (damaged)").
- **Partner** — "What should I know or consider?" The AI Business Partner: insights feed + conversation + Research mode (§9). (**"Partner" is the working name, not the final one** — the owner prefers it over "Advisor" because MI YONE stands *alongside* the owner, not above them; the Krio "Padi" is a strong candidate for the Sierra Leone market but its international fit is unresolved. Final naming is a Phase 4 brand decision; all specs use "Partner" provisionally.)
- **Menu** — everything asked less than weekly: Customers, Suppliers, Insights/Reports, Business settings, People & roles, Account, Help. A labeled list, not a junk drawer.

**Desktop is an expansion, not a redesign:** same IA as a left sidebar; Home gains a second column (attention + insight beside the numbers); tables replace cards for lists; keyboard entry becomes first-class (tab-through sale entry). Nothing exists on desktop that mobile lacks — desktop only has more room.

**Screen ↔ question map (acceptance gate):** Home→"How is my business doing?" · Money→"Where is my money?" · Stock→"What do I have / what's low?" · Partner→"What should I know?" · Customers→"Who owes me?" · Suppliers→"Who must I pay?" · Insights→"What is changing?" · Settings→"How do I control this?" Any proposed screen that can't join this table is rejected.

---

## 6. Dashboard (Home) Structure

Top to bottom, in priority order — four blocks, never more:

1. **Health header** — period toggle (Today · This week · This month): **Money in · Money out · Left over**, in numbers a notebook-keeper recognizes. One-line comparison underneath: "Le 240,000 more than last month ↑". The word **"profit" does not appear in the header** — see §6.1.
2. **Needs attention** — only when true (absent when empty, replaced by "Nothing needs your attention ✓"): low stock (n products), customers owe you (total + count), you owe suppliers, unusual spending flag. Each row is one tap from the fix.
3. **Partner insight** — exactly **one** card, the most important deterministic insight, in plain words with its numbers ("Transport cost you Le 85,000 this month — more than double your usual."). Tap → conversation with context preloaded. Dismissible; never more than one.
4. **Quick actions** — Money in · Money out · Add stock · Ask Partner (redundant with + Add by design; the dashboard is also a launchpad).

No charts on Home in v1 beyond a single tiny trend sparkline in the health header. Charts live in Insights, where the user goes *asking* for them. Thirty metrics do not appear because the database contains them.

### 6.1 Cash vs Profit — resolved against the Phase 2 financial model

The Phase 2 model (§9 there) already computes two different truths, and the UI must never blur them: credit sales are *booked* income when made but *cash* only when the customer pays. Calling money-in-minus-money-out "profit" would be wrong whenever credit exists in either direction. Resolution, binding on all screens and on the Partner's language:

- **Home health header = the cash view.** "Money in" = money actually received (cash sales + customer payments on debts). "Money out" = money actually paid. "**Left over**" = the difference — deliberately the notebook word, because that is exactly what a notebook computes. Never labeled profit.
- **Profit is its own, clearly explained figure** — shown in Insights (and as an optional second line on Home once a business has credit activity): "**Profit this month (estimated): Le 410,000** — your sales minus your costs, including Le 120,000 customers still owe you." Tap → plain-language breakdown. It carries the "estimated" label per Phase 2 §7.1 (costing model) and drops the qualifier only if/when the costing model earns it.
- **The bridge is taught where it matters:** when the two diverge meaningfully, the attention/insight layer says so in owner language: "You made Le 410,000 in profit, but Le 120,000 of it is still with your customers." That sentence *is* MI YONE's differentiation — most owners have never had booked-vs-cash explained to them at the moment it applies to their own money.
- Glossary additions in §12 make the terms binding. The Partner inherits the same definitions — it never says "profit" meaning the cash figure.

---

## 7. The Ten-Second Sale (flagship interaction spec)

Target: **≤ 10 seconds, ≤ 5 taps** for the common case, one-handed, mid-customer.

**Required now (only this):** amount — big numeric keypad, amount-first (the notebook habit is "write the money"). That is a complete sale.
**One-tap optional, same screen:** what was sold (recent/frequent product chips; tap = attaches product + auto-price + stock decrement; skip = unitemized sale, Fatmata's default); Paid / **Owes you** toggle (default Paid; "Owes you" expands customer pick + optional part-payment).
**Deferred (edit later, never asked now):** note, customer on paid sales, date (defaults now, backdatable via edit), category (auto: Sales).
**Save** — single big button → instant confirmation ("Sale saved · Le 45,000") with a 5-second **Undo** (undo within the window = invisible reversal; after it, the path is "Fix").

Speed mechanics: keypad opens pre-focused; recent products learned from usage (no setup); repeat-last-sale one tap from confirmation; idempotency key attached silently — double-tap and retry can never double-record.

The same pattern (amount-first, chips, optional depth) is the template for expenses and stock entry. **Design rule it establishes: required fields are the fields the ledger cannot live without — nothing else is ever mandatory.**

---

## 8. Network Reality: Low-Bandwidth Experience

Design assumptions: 3G-class speeds, intermittent drops, metered data.

- **Optimistic capture:** Save responds instantly in the UI; the record shows a subtle "Saving…" → "Saved ✓" state. Retries are automatic and silent (idempotency makes them safe). If connectivity is gone entirely, the record is held and visibly marked "**Waiting for network — will save automatically**"; a persistent, calm banner counts pending records. Nothing is lost by walking out of coverage.
- **Scope (decided):** this is *capture queueing* for Money in/out and stock entries — not full offline mode (no offline dashboard/analytics, which would require sync infrastructure Phase 2 deliberately excluded). **Owner decision: APPROVED as a v1 design requirement — but implementation is gated.** Phase 4 must NOT casually implement it alongside ordinary screens: before any offline-capture code is written, a dedicated **Offline Capture Technical Design** must be produced and approved, covering at minimum: duplicate prevention end-to-end (client-generated idempotency keys surviving the queue), device restarts (durable local queue, not in-memory), authentication expiry while queued (records must survive re-login and never post as the wrong user), conflicting/duplicate records across retries, timestamp integrity (capture time = `occurred_at`, sync time never overwrites it), failed-synchronization UX (visible, retryable, never silently dropped), and multi-device behavior (same account, two phones, defined outcome). Until that design is approved, the UI ships with the optimistic-capture + auto-retry behavior above, which degrades gracefully without a durable queue.
- **Data diet:** no images in core flows; system font stack (no webfont download on mobile data); skeleton screens over spinners; lists paginate at 25; the dashboard is one request (already guaranteed by the API); no polling — pull-to-refresh is the refresh model; animations are opacity/transform only and reduced-motion-aware.
- **Recoverability:** every failed action states what happened in plain words and keeps the user's input. No dead ends, no lost forms, ever.

---

## 9. The AI Experience

Not a chatbot bolted on — the Partner tab is a **feed first, conversation second**:

- **Insights feed:** deterministic, proactive cards (from the analytics attention/insight engine — the AI phrases, never computes): "Expenses are rising faster than sales." · "3 products are running low." · "5 customers owe you Le 320,000 altogether." Each card: plain statement + its numbers + one action (See details · Ask why · Dismiss). Frequency-capped and quiet — a few per week, not per hour; the Partner is never annoying.
- **Conversation:** free questions, plus always-visible suggested questions grounded in current data ("Why is my profit down this month?" · "What sold best this week?") so nobody needs to know how to prompt an AI. Answers: short, numbers shown, source-labeled **"From your records"**, at most one recommendation, phrased as a consideration ("You could…"), never as guaranteed financial truth. When the data can't answer, it says so: "I can't tell from your records — you started tracking stock two weeks ago."
- **Research mode:** an explicit toggle/entry within Partner — different visual treatment, results labeled **"From the web · [source, date]"** with sources listed, never blended into business-data answers. Long-running: progress state + notification-on-done pattern.
- **Trust furniture:** a permanent, quiet line under AI recommendations: insights are based on your records; decisions are yours. First-use of Partner shows a one-time plain-language note on what the Partner can see (your business records in this app) and what it never sees.

---

## 10. States: Empty, Loading, Error, Success

**Empty states teach — one next action each, never a wall of zeros.** Home (new business): "Let's get your first record in. [Record money in] [Record money out]" — plus optional "Show me with example numbers" (demo data, labeled on every screen it touches, removable in one tap). Stock: "Track products to see what's selling and what's running low. [Add your first product] — Not selling products? You can skip this." Money/Owed, Customers, Suppliers, Partner: same pattern — what this section does (one sentence), one button, one reassurance. Every empty state creates progress, not guilt.
**Loading:** skeletons matching final layout; instant paint of cached last-known dashboard numbers with a subtle "Updating…" (stale-while-revalidate feel); never a full-screen spinner after first launch.
**Errors:** human sentence + what to do + kept input. "We couldn't save this sale. Check your connection and tap Save again — we kept everything you entered." Technical codes never surface (request-id sits behind a small "details" link for support).
**Success:** confirmation with the number that matters ("Saved · Le 45,000") + Undo where applicable + occasionally one earned progress note ("That's 50 sales recorded this month 🎉" — rare, honest, off by a setting).
**Pending/sync:** the §8 "waiting for network" treatment; anything not yet on the server is visually distinct but never alarming.

---

## 11. Interaction Patterns (system-wide rules)

- **Amount-first entry** with a large custom keypad on money fields; SLE formatting live as typed; no decimals shown unless typed.
- **Chips over dropdowns** for categories/products (recent + frequent first, search behind); pickers open as bottom sheets, never new pages, in capture flows.
- **Progressive disclosure:** every record card shows 3 facts; "More" reveals the rest. Advanced options never precede essential ones.
- **Confirmation policy:** destructive/irreversible-feeling actions (archive product, remove staff, fix a record) confirm with a consequence sentence; routine saves never confirm — they *undo*. (Undo over confirm wherever the backend permits: 5-second window → invisible reversal.)
- **Lists:** newest first; date-grouped ("Today", "Yesterday", "Feb 12"); money-in green / money-out neutral-dark (not red — an expense is normal business, not an error; red is reserved for problems); infinite scroll with pagination underneath.
- **Search & filters:** one search field per list; filters as chips (date-range presets: Today · Week · Month · Custom).
- **Touch:** min 44×44px targets; primary actions in thumb reach (bottom half); swipe gestures only as shortcuts, never the only path.

---

## 12. Vocabulary: the Translation Layer (binding glossary)

The left column is banned from every user-facing surface (UI, notifications, AI answers, error messages):

| System term | User language |
|---|---|
| Transaction (income/expense) | Money in / Money out |
| Reversal / immutable ledger | Fix this record / "Fixed · see history" |
| Receivable | Owes you / Owed to you |
| Payable | You owe |
| Settlement | Mark as paid / Payment received |
| Inventory movement | Stock change ("Added", "Sold", "Removed (damaged)") |
| Inventory valuation | What your stock is worth (estimated) |
| Analytics / metrics | Insights / Business health |
| Idempotency, domain, API, sync queue | (never surfaced at all) |
| AI context | "What the Partner can see" |
| Audit trail | History |
| Cash result (cash in − cash out) | Left over — never "profit" |
| Profit (booked revenue − expenses) | Profit (estimated) — always with its plain-language explanation, incl. money still owed (§6.1) |

The glossary lives in the design system as the single naming source; the AI's system prompt (AI phase) inherits it so the Partner speaks the same language as the buttons. Krio equivalents get a column when localization begins.

---

## 13. Trust & Transparency Patterns

Every action answers, visibly: what did I just do, did it work, is it on the server? (§10's success/pending states are the mechanism.) Every number answers, on tap: where is this from? — period, what's counted, "estimated" labels on estimated figures (stock value), and booked-vs-cash phrased humanly ("counting money actually received"). Every AI statement is provenance-labeled (records vs web, §9). Every fixed record keeps its visible history (§4 J4). Data ownership surfaces in Settings in plain words: what's stored, what the Partner can see, export your records (future flag), delete conversations. Nothing is ever silently sent anywhere — this is "Own your money" as UX.

---

## 14. Accessibility

WCAG 2.1 AA as the floor: contrast ≥ 4.5:1 for text (a hard constraint on Phase 4's palette exploration — see §16: decorative/metallic colors never carry text or information, and accent colors get darkened text variants); 44px touch targets; full functionality at 200% text zoom and system font-size settings honored; visible focus states and complete keyboard paths on desktop; semantic structure and labels for screen readers (money amounts read with currency, icons never meaning's only carrier); color never the only signal (in/out have symbols +/−, not just green/dark); plain language everywhere (short sentences, no jargon — an accessibility feature, not just tone); reduced-motion respected; error recovery per §10. Accessibility acceptance is part of every screen's definition of done in Phase 4, not an audit afterward.

---

## 15. Localization Strategy

English first; **Krio-ready from the first component**: every user-facing string in a message catalog keyed by ID (no hard-coded strings, no string concatenation — full-sentence templates with placeholders, because word order changes across languages); dates/numbers/currency formatted through the locale layer (money display strings still come from the server, which gains a locale parameter later); layouts tolerate ±40% text length; language switch is per-user (staff and owner can differ). The §12 glossary is the translation unit — Krio translation is a content task, not an engineering task, when its time comes. RTL not required for English/Krio; noted as out of scope.

---

## 16. Design System Foundation (tokens & inventory — not visual design yet)

**Color: NO palette is locked.** The navy `#071A3D` / emerald `#00C27A` / gold `#D4AF37` set from the logo brief is a **starting hypothesis only, not branding** — and the owner has set an explicit mandate for Phase 4: MI YONE must have its own recognizable visual identity, **not read as another navy-and-green fintech dashboard**. Phase 4 therefore begins with genuine visual-language exploration (multiple directions, evaluated against the ownership feeling of §1.1, the trust requirements of §13, AA contrast, and low-end-screen legibility) before any palette is committed. What *is* fixed now — independent of any palette — are the **semantic color roles** every candidate must fill: a money-in/positive role, a neutral money-out role (never red — an expense is normal business), an attention role (low stock, waiting-for-network), a problem role (errors and overdue only), brand/identity moments, and a neutral surface/text scale. Also fixed: whatever the palette, gold-class decorative colors never carry information, and every role passes AA in both prospective themes.
**Type:** system font stack (performance, §8); scale of 5 sizes (display number / title / body / secondary / caption); tabular numerals for all money.
**Spacing/shape:** 4px grid; one card radius; elevation used sparingly (sheets and FAB only).
**Component inventory to build in Phase 4** (complete list — screens compose only these): AmountKeypad · MoneyDisplay · RecordCard (transaction/sale/stock variants) · ChipPicker · BottomSheet · PrimaryButton/secondary/destructive · SegmentedTabs · AttentionRow · InsightCard · HealthHeader · EmptyState · SkeletonList · Toast/UndoBar · SyncBadge · ListSection (date-grouped) · SearchField · FormField (the few real forms: product, customer, supplier, settings) · ConfirmDialog · Sparkline (the one chart primitive in v1).
Anything a screen needs beyond this list triggers a design-system conversation first — that's how the system stays a system.

---

## 17. UX Acceptance Principle (the gate for Phase 4)

Before any screen is implemented it must state: the **business question** it answers (§5 map) · the **one primary action** it offers · its **empty, loading, error, and success states** (§10) · its **vocabulary check** (§12 — no banned terms) · its **thumb-reach and AA check** (§11, §14). Any feature that cannot be explained in one sentence of ordinary business language goes back to design. The flagship metric stays measurable: a sale recorded in ≤10 seconds on a mid-range Android phone on 3G — this gets actually timed in Phase 4 acceptance, not assumed.

---

## 18. Decision Log & Open Decisions

**Decided by the owner (Rev 2):** offline capture = approved design requirement, implementation gated on a dedicated technical design (§8) · "Partner" = working name; final name is a Phase 4 brand decision (§5) · palette = hypothesis only; Phase 4 explores identity before locking (§16) · header shows cash ("Left over"), profit is separate, explained, estimated (§6.1).

**Decided since (Phase 4 gate):** demo/example data in onboarding = **YES** (labeled, removable, never touches real ledgers) · session mechanism = **server-side opaque sessions** (Phase 2 §17) · dark/light = **light-only v1** · palette = **Ink & Clay locked** (Phase 4 §2) · Phase 5 order ratified (Phase 4 §40).

---

## 19. The Business Setup Experience (first two minutes — a first-class design object)

The architecture is strong once someone is inside; the first two minutes decide whether they ever get there. Setup must feel like **"I'm setting up my business"** — an act of ownership — never "I'm configuring a software system." One question per screen, business language only, visible progress, and the business takes shape on screen as it's described.

```
Welcome                “Your business, in your pocket.” — one line, one button. MI YONE's
   ↓                   identity moment (§1.1): the brand lives at the door.
Create account         Name, phone/email, password. Nothing else. No “user profile”.
   ↓
Create business        “What is your business called?” — the answer immediately becomes
   ↓                   the app's header identity (Mariama's Provisions).
Business type          Chips, not a dropdown: Shop · Trading · Food & catering · Services ·
   ↓                   Salon/beauty · Building & contracting · Other. (Seeds smarter default
                       categories; skippable.)
Currency               Confirmed, not asked: “You'll record money in Leones (Le).” — one tap.
   ↓                   (Preset SLE; changeable in settings. A question would be configuration;
                       a confirmation is reassurance.)
Optional products      “Do you sell products you want to track?” — Yes → add 1–3 quick
   ↓                   products (name + price, nothing more); Not now → skipped without
                       guilt (Fatmata's path, §2). Never a gate.
First action           “Let's put your first record in.” → the real ten-second capture sheet
   ↓                   (§7) with a sale or expense — or “Show me with example numbers”
                       (labeled demo, §10, pending owner decision).
MI YONE Home           The dashboard already answers something true about their business.
```

Rules: the whole path is ≤ 2 minutes on 3G; every step after account creation is skippable except the business name; nothing asked here that isn't used immediately (no address, no tax numbers, no logos — those live in settings for whoever wants them); progress is shown as the business coming to life, not as a stepper of forms; and abandoning mid-setup loses nothing — reopening resumes where they stopped. Phase 4 must produce screen-by-screen specifications for this flow with the same rigor as the dashboard — it is the product's first impression and its highest-stakes empty state.

---

## 20. Phase 4 Charter (agreed scope — discipline clause included)

Phase 4 is **NOT "make the UI."** It is, in order:

**Stage A — Visual Design System + Screen Specifications + Frontend Design Architecture (documents, for approval):**
brand identity direction (exploration first — multiple visual directions, §16 mandate: recognizably MI YONE, not generic fintech) · logo usage · typography · color system (locked only at the end of exploration) · spacing · iconography · motion principles · **dark/light mode decision** · the component specifications (§16 inventory) — buttons, cards, navigation, forms, keypad · screen-by-screen wireframe descriptions for: setup flow (§19), dashboard, money flows, stock flows, Partner/AI interface, customers/suppliers, empty & error states — each in mobile and desktop layout, with accessibility and responsive behavior specified per screen · frontend design architecture (component structure, state/data-fetch patterns, i18n wiring, theming tokens).

**Stage B — implementation, only after Stage A is approved.** The binding rule, verbatim from the owner: **before writing frontend code, produce the visual design specification and screen-by-screen wireframe descriptions for approval.** No React components are generated from unapproved assumptions. Offline capture additionally requires its own approved technical design (§8) before its code exists.

---

*End of Phase 3 experience design (Rev 2 — APPROVED with adjustments incorporated). Next: Phase 4 Stage A on the owner's go. No screens have been built; no frontend code exists.*
