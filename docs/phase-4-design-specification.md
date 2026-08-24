# MI YONE — Phase 4: Visual Design System · Screen Specifications · Frontend Design Architecture

Status: DESIGN SPECIFICATION — **no production frontend code, no screens, no components have been built.** This document is Stage A of the Phase 4 charter (Phase 3 §20) and stops for owner review before any implementation.
Depends on: Phase 2 (Rev 2) technical architecture · Phase 3 (Rev 2, approved) experience design. Section numbering below mirrors the owner's Phase 4 brief 1:1 for review.
All contrast ratios quoted in this document were **computed, not estimated** (WCAG 2.1 relative-luminance formula); every quoted pair passes AA ≥ 4.5:1.

---

## 1. Brand Philosophy — what MI YONE feels like

Before any color exists: MI YONE should feel like **a capable business partner living in the owner's pocket** — and more precisely, like *the owner's own well-kept book that learned to think*. The emotional recipe, in tension pairs (each quality kept honest by its counterweight):

- **Owned, not rented.** Everything on screen reads as *the user's* — their name, their numbers, their language. The product's own brand steps back once you're inside (Phase 3 §1.1).
- **Confident, not corporate.** Sure-footed typography and calm color; never the gray chill of enterprise software, never a boardroom aesthetic pointed at a market trader.
- **Warm, not playful.** This is money. Warmth comes from material and language, not from mascots, confetti, or rounded-everything cuteness.
- **Clear, not clever.** Every screen answers its one question loudly; decoration never competes with a number.
- **Intelligent, not theatrical.** The Partner shows its usefulness in plain sentences with real figures — no sparkle icons, no robot faces, no "thinking…" theater (§23).
- **Local, not folkloric.** Sierra Leonean relevance through respect — sunlight-readable contrast, Krio-ready copy, notebook-familiar patterns — not through decorative "African" clichés.
- **Progressing.** The interface quietly shows a business getting more organized: histories filling, debts clearing, records accumulating.

Banned aesthetics (the brief's list, adopted as hard constraints): corporate coldness · futuristic/cyberpunk · gradient-heavy fintech gloss · crypto neon · toy-like playful fintech · visual clutter · artificial AI gimmicks.

---

## 2. Visual Identity Exploration — three directions, one recommendation

### Direction A — "Ink & Clay" (warm paper, dark ink, clay accent)

**Emotional character:** the trusted notebook, grown up. Warm off-white ground like good paper, near-black warm ink for words and numbers, a clay/terracotta brand accent drawn from laterite earth and fired brick — colors of West African ground and marketplaces, not of banks. Deep green appears *only* where money comes in, so it keeps meaning. Feels: owned, warm, honest, sunlit.

| Role | Value | Notes |
|---|---|---|
| Background | `#FAF7F1` warm paper | the product's ground |
| Surface / cards | `#FFFFFF` | quiet lift off paper |
| Text primary | `#1F1912` warm ink | 16.3:1 on paper |
| Text secondary | `#5C544A` | 7.0:1 on paper |
| Brand / primary action | clay `#9A4520` (tints `#F3E4DA` → shades `#6E3117`) | 6.1:1 as text; white-on-clay button 6.5:1 |
| Money in / success | green `#1B7A4B` (tint `#E3F2E9`) | 5.0:1 on paper |
| Money out | text-primary ink — deliberately neutral | |
| Attention / warning | amber `#8A5B00` text, `#FBEED3` fill | 5.5:1 |
| Problem / error | red `#B3261E`, fill `#FBE7E5` | 6.5:1 |
| Info / sync | slate `#3D5A80`, fill `#E4EAF2` | 6.6:1 |
| AI/Partner state | clay family + paper — the Partner is *of the brand*, not a separate neon persona | |

**Secondary colors:** tints of the above roles only — no free palette.
**Risk:** warm neutrals are harder to keep consistent than gray; mitigated by tokens (§34).

### Direction B — "Deep Harbor" (the navy + emerald hypothesis, matured)

**Emotional character:** serious financial confidence. Deep navy `#0B1E3D` identity surfaces, white content surfaces, emerald `#00794C`/`#00C27A` actions, gold strictly decorative. Feels: premium, secure, institutional.
Primary `#12294F` text on white 14.4:1; emerald-dark text 5.5:1; white-on-emerald buttons 5.5:1; emerald on navy 7.1:1 — all pass.
**Honest assessment:** this is the strongest *generic* direction — and that is its failure. Navy + green + white money app is the global fintech default (banking apps, wallets, accounting SaaS). It would look credible and forgettable, and it directly violates the brief's non-negotiable rule. It also centers *institution* aesthetics when MI YONE's philosophy centers the *owner*.

### Direction C — "Market Morning" (white, violet, sun)

**Emotional character:** bright modern optimism. Clean white, deep violet `#5B3FA8` as brand/action (7.7:1), warm sun-amber highlights, ink `#221A33`. Feels: energetic, young, app-store-modern.
**Honest assessment:** distinctive and accessible, but its energy reads consumer-social rather than "my business's money is safe here"; violet has no semantic or local anchor and drifts toward telecom/crypto branding. Note also: any *orange*-forward variant was rejected outright — it would read as an Orange-telco skin, the opposite of "its own product."

### Comparison & recommendation

| Criterion | A Ink & Clay | B Deep Harbor | C Market Morning |
|---|---|---|---|
| Not a generic fintech dashboard | **Strong** | Fails | Good |
| Ownership feeling (§1.1 Phase 3) | **Strong** (paper = my book) | Weak (bank's building) | Medium |
| Trust for money | Strong (calm, honest) | Strong | Medium |
| Sunlight/low-end screen legibility | **Strong** (light, high-contrast) | Medium (dark surfaces glare badly outdoors) | Strong |
| Local relevance without cliché | **Strong** (earth, paper, market) | None | None |
| Semantic color headroom (green stays money-in) | **Strong** (green unused elsewhere) | Weak (green is also the action color — meaning collides) | Strong |
| AA compliance | Verified | Verified | Verified |

**RECOMMENDED: Direction A — Ink & Clay.** It is the only direction that *is* the product philosophy: the owner's book, warm and theirs, with intelligence added — while B is somebody's bank and C is somebody's app. It is maximally legible in the true usage environment (outdoor light, cheap screens), it protects financial color semantics by spending green nowhere else, and no significant competitor in the category owns warm-paper-and-clay — it is recognizable at a glance. Direction B's navy survives in one place: as an optional deep-ink accent for the identity moments (splash, welcome) if the logo work (§4) wants it.

**✅ OWNER DECISION: Ink & Clay APPROVED — palette locked** (paper `#FAF7F1` · ink `#1F1912` · clay `#9A4520` · money-in green `#1B7A4B`; green reserved for financial meaning; no gradients/neon/cyberpunk). These are now the binding values for §6 and §34.

---

## 3. The "Ownership" Visual Language

How "this is mine" appears in the interface — mechanisms, not slogans (extends Phase 3 §1.1):

- **Language:** the possessive house voice ("Your money in", "You owe", "Your stock") — governed by the Phase 3 §12 glossary; screen titles prefer the user's nouns ("Mariama's Provisions") over product nouns ("Dashboard").
- **Hierarchy:** the user's numbers are always the largest thing on any screen — bigger than any label, any brand element, any Partner text. MI YONE's UI is typographically subordinate to the user's data. That *is* the ownership hierarchy.
- **Layout:** the business identity block (name + optional initial-mark, §4) anchors Home's top-left — the position of ownership; MI YONE's own mark appears inside the product only at the door (auth/splash) and in Menu → About.
- **Personal business identity:** each business gets a generated initial-mark (business initial in a clay-tinted roundel) used in the header, business switcher, and app-switcher context — their mark, not ours.
- **Confirmation states:** confirmations name *their* thing, never the system's: "Sale saved · Le 45,000" / "Aminata's debt cleared" — not "Transaction created".
- **Data presentation:** every figure is inspectable (tap → where this comes from); "estimated" labels never hide; history ("see history") is always reachable — you can't own what you can't examine.
- **Control placement:** anything that changes *their* data sits visibly in *their* reach — Fix, history, export (future), "What the Partner can see" — never buried as system administration.
- **Interaction patterns:** agency attribution ("You cut transport costs 20%"), undo over confirm (the owner's action stands unless *they* take it back), and the Partner proposing, never prescribing.
- **Restraint rule:** the word "own"/"ownership" itself is copy for marketing pages, not UI chrome; in-product, ownership is *felt* through the mechanisms above. One exception: the welcome screen may carry the philosophy line once (§31).

---

## 4. Logo / Brand Mark — behavioral requirements (no logo invented here)

There is no approved MI YONE logo yet; a logo brief exists (geometric mark exploration). Per the owner's rule, this section defines **requirements the eventual logo must satisfy**, not a design:

- **Wordmark:** "MI YONE" set in the product's type family (or a modestly customized cut of it), high x-height, works letterspaced in caps and in mixed case; must remain legible at 90px wide.
- **Mark/icon:** a single geometric form that survives 1-color reproduction; must not depend on gradient, gold, or fine line detail; must read at 16px (favicon) and 48px (app icon) without simplificated redraws being *required* (an optimized favicon cut is permitted).
- **Minimum sizes:** mark 16px; wordmark 90px width. **Clear space:** ≥ the mark's own width on all sides; nothing else enters it.
- **Light background:** ink or clay versions on paper/white. **Dark background:** paper-white version on ink or deep navy identity moments. Never on photographs, never on gradients.
- **App icon:** mark on a solid clay or ink field (explore both), no wordmark, no border; must sit comfortably in Android adaptive-icon masks (circle, squircle, rounded square).
- **Favicon:** the 16px-optimized mark, single color on transparent/solid.
- **Splash/loading:** mark centered on paper (light) — shown only on cold start, never as an artificial delay; no animation beyond a single soft fade (respects reduced-motion).
- **In-product presence:** the door (welcome/auth), Menu → About, and nowhere else (§3).

---

## 5. Typography

**Decision: system font stack — no webfonts.** `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`. Why: zero bytes on metered data (§ Phase 3 §8), native rendering quality on low-end Android (Roboto/Noto are excellent and pre-installed), full Latin coverage for English and Krio (Krio uses Latin script — no special glyph risk), automatic harmony with OS accessibility font-size settings, and one less moving part. The identity cost is real (no proprietary typeface) and accepted: MI YONE's recognizability comes from color, layout, and voice (§2, §3); a brand typeface can be revisited post-v1 as a progressive enhancement (font-display: optional so it never blocks or shifts).

| Style | Size/line | Weight | Use |
|---|---|---|---|
| Display (money hero) | 34/40 | 700 | the amount in capture + health header "Left over" |
| Heading 1 | 24/30 | 700 | screen titles |
| Heading 2 | 20/26 | 600 | section heads |
| Heading 3 | 17/24 | 600 | card titles |
| Body | 16/24 | 400 | default; never smaller for reading text |
| Secondary | 14/20 | 400 | supporting lines, timestamps |
| Caption | 13/16 | 500 | labels, chips, badges — never paragraphs |
| Numbers | any of the above | — | `font-variant-numeric: tabular-nums lining-nums` **mandatory for every number** |
| Money | Display/H3/Body variants | 600–700 | tabular numerals + non-breaking thin space grouping; currency symbol at Caption-weight relative size ("Le" smaller than digits, never styled as decoration) |

Rules: sizes are rem-based (respect user scaling to 200%); line length ≤ ~65ch on desktop; no ALL-CAPS body text (caps only for tiny labels with letterspacing); no light weights below 16px.

---

## 6. Color System — semantic tokens

Tokens only — components never hard-code hex. Full architecture in §34; the semantic layer (values = Direction A, pending approval):

```
--color-background        #FAF7F1   the paper ground
--color-surface           #FFFFFF   cards, sheets
--color-surface-sunken    #F3EFE7   grouped-list wells, keypad bed
--color-surface-elevated  #FFFFFF + shadow.1 (sheets, dialogs)
--color-text-primary      #1F1912
--color-text-secondary    #5C544A
--color-text-disabled     #8A8177
--color-border            #E6DFD4   hairlines; #C9BFB0 for inputs
--color-brand             #9A4520   clay — identity + primary action
--color-brand-strong      #6E3117   pressed/active
--color-brand-tint        #F3E4DA   selected chips, brand washes
--color-action            = --color-brand (one primary action color; a separate action hue would dilute both)
--color-money-in          #1B7A4B   + tint #E3F2E9
--color-money-out         = --color-text-primary (neutral by design — Phase 3 rule)
--color-success           = --color-money-in family (success ≈ money-safe; one green, one meaning-cluster)
--color-warning           #8A5B00   + fill #FBEED3   (attention: low stock, waiting-for-network)
--color-danger            #B3261E   + fill #FBE7E5   (errors, overdue only — never routine money-out)
--color-info              #3D5A80   + fill #E4EAF2   (sync/info/research provenance)
--color-focus-ring        #3D5A80   2px, 2px offset — visible on every interactive element
```

Financial semantics, restated as law: money in → green treatment + "+" glyph; money out → neutral ink + "−" glyph; attention → amber; problem → red; **red never means "money left"** and **green never means merely "number went up"** (a rising *expense* trend renders amber/neutral, not green). Color is never the only signal — every colored state pairs with a glyph or word (§9, §29).

---

## 7. Spacing & Layout

**Scale (4px base):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. No values off-scale.
**Mobile:** page gutters 16; card padding 16 (20 for HealthHeader); between cards 12; between sections 24; list row min-height 56; bottom-nav height 64 + safe-area inset; FAB clearance 80 bottom padding on scrollable lists.
**Desktop:** gutters 32; content max-width 1040px (single-column reading ~640); two-column Home splits 7/5; tables full-width within content.
**Grid:** mobile = single column, full-bleed cards within gutters; desktop = 12-col, 24px gaps, sidebar excluded from the grid.
**Rule:** vertical rhythm from the scale only; sibling spacing is uniform within a section (no hand-tweaked one-off margins).

## 8. Shape & Elevation

Radius: inputs & buttons 10 · cards 14 · chips pill · bottom sheets 20 top corners · dialogs 16 · thumbnails/roundels circle. One radius per component class — no mixing.
Elevation: **level 0** (default): flat surfaces separated by background contrast + hairline borders — the paper aesthetic does its work without shadows; **level 1** (floating: FAB, toasts, dropdown): `0 2px 8px rgba(31,25,18,0.10)`; **level 2** (sheets/dialogs over scrim): `0 8px 24px rgba(31,25,18,0.16)` + scrim `rgba(31,25,18,0.4)`. Nothing else casts shadows. Borders: hairline `--color-border` on cards sitting on paper; none inside sunken groups.

## 9. Iconography

**Style:** outlined, 2px stroke, rounded caps/joins, 24px grid (20px in dense rows, 28px in nav) — humanist-geometric, matching the ink line weight of the type. Source: a single open set (Lucide) restyled by token color — no mixed icon families, no filled/outlined mixing within a context (nav active state may fill).
**Vocabulary (fixed):** nav — Home: house · Money: two opposing arrows (↓in ↑out motif) · Stock: stacked boxes · Partner: compass (guidance/alongside — deliberately *not* a robot, chat bubble, or sparkle) · Menu: three lines. Financial — money-in: arrow-down-into-tray + "+" · money-out: arrow-up-from-tray + "−" · owed-to-you: hand-receiving · you-owe: hand-giving · fix: rotate-ccw ("make it right", not a pencil — editing is not what happens) · history: clock. Stock — box, box-alert (low), box-x (damaged). People — single head (customer), truck (supplier). States — warning: triangle · error: octagon · info/sync: circle-i / arrows-cycle · offline-pending: cloud-dashed.
**Rule:** icons always accompany text in navigation and actions; icon-only buttons require accessible labels and are allowed only for universally learned actions (back, close, search).

## 10. Motion

Restrained, purposeful, cheap. Durations: **fast 120ms** (press feedback, chip select) · **normal 200ms** (sheet in/out, page transitions, toast) · **slow 320ms** (celebratory count-up on first-ever record, undo bar slide) — nothing longer. Easing: standard `cubic-bezier(0.2, 0, 0, 1)`; exits accelerate. What animates: state change (button press tint, sync badge pulse — opacity only), navigation (sheet slide-up; page fade-through 120ms), confirmation (toast slide+fade; the saved amount does a single 1.0→1.03→1.0 settle), loading (skeleton shimmer at low amplitude; sync spinner ≤1/sec rotation), synchronization (cloud-dashed → cloud-check crossfade). Never: parallax, springs on money figures, looping decorations, animated charts (bars/lines draw once, 200ms, then static). All motion gated by `prefers-reduced-motion: reduce` → crossfades only. GPU-cheap properties only (opacity/transform).

## 11. Mobile Design System

Foundation target: **360×640dp, Android 10+, 3G, one-handed.**
- **Thumb map:** primary actions (FAB "+ Add", Save buttons, bottom nav) live in the bottom 40% of the screen; destructive/rare actions (Fix, archive) live top-right — deliberately *out* of casual reach.
- **Touch targets:** ≥44×44dp interactive, ≥48dp for primary; ≥8dp between adjacent targets.
- **Bottom sheets are the mobile workhorse** (capture flows, pickers): they keep context visible, put controls at the thumb, and dodge the keyboard cleanly. Full-page navigation only for destinations (tabs, details), never for input.
- **Keyboard behavior:** money fields open the custom AmountKeypad (§15), not the OS keyboard; text fields scroll their sheet to keep the field + primary button visible above the OS keyboard; "Done" on the OS keyboard advances or submits per field position.
- **Safe areas:** bottom nav and sheets pad by `env(safe-area-inset-*)`; FAB offsets above the nav.
- **Small/low-end:** no blur effects, no large images, shadows at the two defined levels only; lists virtualize beyond 50 rows; JS budget per §35. System font scaling honored to 200% — layouts reflow (cards grow), never truncate money figures (wrap the row instead).
- **Offline affordances** always visible where relevant: SyncBadge in the header region, pending banners above lists (§26).

## 12. Desktop Design System

Same product, more room. **Sidebar 240px** (collapsible to 72px icon rail): the five mobile destinations in the same order + business identity block at top + user/account at bottom; **content area** max 1040px centered.
- Home becomes two columns (health + insight | attention + quick actions); everything else stays single-purpose.
- **Tables replace card lists** on Money/Stock/Customers/Suppliers (same data, denser): row height 48, sticky header, right-aligned tabular money columns, row click = detail (drawer from right, 400px, keeping list context).
- **Keyboard:** full tab order; `/` focuses search; `N` opens + Add; arrow keys traverse tables; Enter opens; Esc closes sheets/drawers; visible focus ring everywhere (§6).
- **Capture on desktop:** the same + Add flow as a centered modal (not a sheet), numeric row keys type into the amount; the ten-second sale becomes the three-second sale with a numpad.
- Hover states exist on desktop only (tint shifts); nothing depends on hover to be discoverable.
- Breakpoints in §33.

---

## 13. Core Component System

The complete inventory (Phase 3 §16 — nothing added, nothing speculative). Shared spec conventions to avoid repetition: every interactive component has default/pressed/focus/disabled states per §14's state rules; every component uses tokens only; every text slot tolerates ±40% string length (§30); accessibility per §29 baseline (role, label, focus, contrast) plus the notes below; error behavior = show the §27 pattern inline, never swallow. "M:" mobile, "D:" desktop.

**AmountKeypad** — Purpose: money entry, the product's most-used input. Anatomy: amount display (Display type, live SLE formatting, "Le" prefix at reduced size) over a 3×4 grid (1-9, decimal, 0, backspace). Sizes: keys ≥64dp height, full sheet-width. Interaction: digits append; long-press backspace clears; decimal key inserts once (disabled after; 2dp max); leading zeros swallowed; amount > sanity cap shakes once + amber hint. States: empty (display shows `Le 0` at 40% opacity) / typing / error. M: replaces OS keyboard inside sheets. D: on-screen grid clickable + physical numpad/row keys type; backspace works. Accessibility: display is a labeled textbox announcing formatted value on change; keys are real buttons. Typography: display Display/700 tabular.
**MoneyDisplay** — Purpose: render any amount consistently. Anatomy: optional sign glyph (+/−) · "Le" · grouped digits (server `display` string verbatim). Variants: hero (Display), row (Body/600), inline (inherits). Direction coloring *only* with the glyph present (green/+, ink/−). Never wraps internally; the row wraps around it. Accessibility: announced as "plus, 45,000 leones".
**RecordCard** — Purpose: one financial/stock event in a list. Anatomy: leading icon (type) · title (what) · secondary line (who/category · time) · trailing MoneyDisplay · optional badges (Owes you · Fixed · Waiting for network). States: default / pressed / pending (amber left edge 3px) / reversed (struck title + "Fixed" badge, 60% opacity). M: 56–64dp row, tap → detail sheet. D: table row equivalent. Variants: transaction, sale, stock-change (quantity replaces money slot).
**ChipPicker** — Purpose: fast choice from few-to-many (categories, products, customers). Anatomy: horizontal wrap of pill chips (recent/frequent first, max 8 visible) + "More…" chip opening a searchable BottomSheet list; selected chip = brand-tint fill + check glyph (not color alone). Chip height 36, text Caption/500, ≥44dp touch box. New-item path inline ("+ New customer") where the flow allows creation. Accessibility: radiogroup/listbox semantics; selection announced.
**BottomSheet** — Purpose: contextual input/pickers on mobile. Anatomy: 20px-top-radius surface, drag handle, title (H3), content, primary button pinned bottom (above keyboard/safe-area). Heights: auto up to 90vh; scrolls internally. Dismiss: swipe-down, scrim tap, Esc/back — with dirty-state guard ("Discard this sale?" ConfirmDialog when input exists). D: becomes centered modal 480px. Accessibility: focus-trapped dialog, restores trigger focus.
**Buttons (Primary/Secondary/Destructive — full system in §14).**
**SegmentedTabs** — Purpose: sibling views within a screen (Money: All·In·Out·Owed to you·You owe). Anatomy: scrollable segment row, selected = ink text + 2px clay underbar (not color-only). 44dp height. Keyboard: arrow-key traversal. Never nested; one level per screen.
**AttentionRow** — Purpose: one "needs attention" item. Anatomy: amber-tinted leading icon · statement (Body: "3 products running low") · trailing chevron. Fill `--color-warning` wash at 8%; row is one tap to the filtered fix view. Danger variant (overdue) uses danger tokens. Never stacks more than 4; 5+ collapses to "…and 2 more".
**InsightCard** — spec in §23.
**HealthHeader** — Purpose: the Home answer. Anatomy: period SegmentedTabs (Today·Week·Month) · three money columns (Money in / Money out / **Left over**, labels Caption, values H3→Display for Left over) · comparison line (Secondary: "Le 240,000 more than last month ↑") · 56×20 Sparkline right-aligned. Left over may show second line "Profit this month (estimated)" link once credit exists (§6.1 Phase 3). Loading: skeleton columns; error: last-known values + "Updating failed · Retry" (never blank). D: spans column 1 with more air.
**EmptyState** — Purpose: teach + one action. Anatomy: small outline illustration (single-color ink line, from the icon family — no cartoon scenes) · what this is (H3) · why it matters (Body, ≤2 lines) · one PrimaryButton · optional quiet secondary ("Not selling products? Skip this"). Never shows zeros.
**SkeletonList** — content-shaped gray-warm blocks (`#EFE9DF` shimmer), matches final layout metrics to prevent shift; 3–6 rows; respects reduced-motion (static).
**Toast** — Purpose: transient confirmation. Bottom-center above nav, level-1 elevation, ink surface + paper text (inverted for pop), 3s, one at a time, never covers the FAB. Content: "Saved · Le 45,000". Accessibility: `aria-live=polite`. Errors never use toasts (they persist inline).
**UndoBar** — Toast variant with Undo action button; 5s with visible countdown ring on the button; the *entire bar* remains one-tap Undo. On timeout, fades — record stands. Never for destructive ops (those confirm instead, §11 policy of Phase 3).
**SyncBadge** — Purpose: connection/save truth in 20px. States: hidden (all synced) · saving (cycle arrows, info) · pending-count (amber cloud-dashed + "2") · failed (danger cloud-x). Tap → plain-language sheet listing pending records + Retry all (§26). Lives right of the business name, both platforms.
**ListSection** — date-grouped list scaffold: sticky Caption header ("TODAY · Le 260,000 in / Le 40,000 out" — totals right-aligned), rows, infinite scroll with page-size 25, end-of-list mark.
**SearchField** — one per list screen; 44dp; leading search icon, trailing clear; debounced 300ms; announces result count; `/` shortcut on D.
**FormField** — the few true forms (product, customer, supplier, settings): label above (Caption/500) · input 48dp (radius 10, border strengthens on focus + focus ring) · help/error line below (error = danger text + icon, field border danger). Never placeholder-as-label. Required marked in the label text ("Name"), optional marked "(optional)" — the reverse of enterprise convention because most MI YONE fields are optional (§7 Phase 3 rule).
**ConfirmDialog** — for consequence actions only: title = the consequence in plain words ("Remove Foday from your business?") · one-sentence body · Destructive + Secondary buttons; destructive never on the sheet-dismiss side. Focus lands on the *safe* action.
**Sparkline** — the single v1 chart primitive: 1.5px ink line, no axes/dots/labels, flat baseline reference at period start, area wash 6% ink; renders once (no animation loop); `aria-hidden` with an adjacent text equivalent (the comparison line *is* the accessible chart).

Anything not in this list does not exist in v1; proposals go through a design-system review first (Phase 3 §16 rule).

## 14. Button System

| Level | Look (Direction A) | Use |
|---|---|---|
| Primary | clay fill `--color-brand`, white text, 48dp, radius 10, full-width in sheets | the one main action per view — **maximum one visible Primary per screen region** |
| Secondary | transparent, 1.5px clay border, clay text | the alternative beside a Primary |
| Tertiary/Text | clay text only, no container, 44dp box | inline actions, "See all" |
| Destructive | danger fill, white text — reserved for ConfirmDialog and rare surfaces | remove/archive confirmations |
| Icon | 44dp square, ink icon, tint circle on press | back, close, search only (§9 rule) |

States (all levels): default · **pressed** (fill → `-strong` shade / tint wash for borderless, 120ms) · **hover** (D only, 8% tint) · **focus** (always-visible ring §6) · **disabled** (40% opacity + `aria-disabled`; *never* used to hide missing-permission actions — those don't render at all) · **loading** (spinner replaces label, width locked, button inert, label preserved for AT: "Saving…") · **success** (150ms check glyph flash before toast handoff — optional, reduced-motion skips).
Hierarchy law: buttons communicate importance by level, not by size or shouting; screens with three Primaries are a design error by definition.

## 15. Money Input (the capture pattern)

One component family serves **sale · expense · money received · money paid · stock purchase · customer payment · supplier payment** — a single sheet pattern with contextual slots, so the user learns *one* motion for every money moment:

```
[Sheet title: what's happening — "Money in · Sale" / "Paying Musa (supplier)"]
[ Le 45,000        ]   ← live-formatted display, Display/700
[   AmountKeypad   ]
[ contextual slot  ]   ← the ONE optional layer this flow needs:
                          sale → product chips · expense → category chips ·
                          debt payment → amount-remaining hint, etc.
[ secondary toggle ]   ← flow-specific: Paid / Owes you (sale) · nothing (expense)
[━━━ Save ━━━]         ← Primary, pinned, thumb zone
```

Rules: amount is always first and always sufficient (§7 Phase 3); SLE formatting live while typing, no decimal complexity unless the user types one; fast correction = backspace repeats + long-press clear; every variant reachable in ≤1 tap from + Add or from the owing entity's screen ("Mark as paid" pre-fills the context slot); desktop gets keyboard-first entry (§12); labels/announcements per field for AT; the idempotency key is generated the moment the sheet opens (not at Save) so a double-fired Save is provably one record.

## 16. Ten-Second Sale — flagship visual specification

The sequence (mobile, the acceptance path):

1. **OPEN** — FAB "+ Add" (anywhere) → sheet slides up 200ms with **Money in / Money out** as two large option rows; "Money in · Sale" is the first, pre-highlighted — tapping the FAB then Enter-equivalent = 2 taps to keypad. Direct long-press FAB → straight to Sale (learned shortcut, not required).
2. **AMOUNT** — keypad live; display grows from `Le 0`. *(taps: digits — not counted against the 5-tap budget)*
3. **OPTIONAL PRODUCT** — one chip row under the keypad: recent products (max 6) + "More…". Tap chip: price auto-fills/adds, chip gains check + qty stepper (default 1). Skip freely — unitemized sale is first-class.
4. **PAID / OWES YOU** — segmented toggle, default **Paid** (zero taps in the common case). "Owes you" expands: customer ChipPicker (+ New) and optional "paid now" partial amount.
5. **SAVE** — full-width Primary. Press → 120ms press state → sheet dismisses → **Toast/UndoBar**: "Sale saved · Le 45,000 · [Undo 5s]". A "Same again" text action rides the toast for repeat sales.
6. **Offline/pending** — if unreachable: same toast but amber "Will save when network returns"; record appears in lists with pending edge + SyncBadge counts up (§26). No blocking, no error.
7. **Error** (rejected by server, e.g. validation): sheet returns with input intact + inline danger banner in §27 voice.

Tap count, common case: FAB → Sale → digits → Save = **3 counted taps**; with product chip: 4; credit sale with existing customer: 5. Animation: sheet 200ms in/out; save settle 320ms; nothing else. **Acceptance test (Phase 5 gate): a timed run on a mid-range Android over throttled 3G must land ≤10s from FAB to toast, and a double-tapped Save must produce exactly one record.** No additional fields may be added to this sheet — the database's other columns stay in the record's *detail* view, editable later.

## 17. Home / Dashboard Specification

Layout top→bottom (mobile): **Business identity row** (initial-roundel + "Mariama's Provisions" + SyncBadge) → **HealthHeader** → **Needs attention** (0–4 AttentionRows or the positive-empty line "Nothing needs your attention ✓") → **one InsightCard** (or nothing — absence is allowed and unremarked) → **Quick actions** (2×2: Money in · Money out · Add stock · Ask Partner). FAB persists.
Number formatting: server display strings; Left over is the visual apex (Display size, ink — *not* green/red-coded; its comparison line carries the direction words). Period selector persists per user. Comparison text pattern: "Le X more/less than last {period} ↑/↓" — words + arrow, not color alone.
Empty (new business): the §25 Home empty state replaces Health+attention until first record. Loading: skeletons for header + 2 rows; cached last-known values render instantly with quiet "Updating…" (stale-while-revalidate, Phase 3 §10). Error: cached values + inline "Couldn't update · Retry"; never a blank dashboard. D: two-column per §12.
Answer-speed acceptance: business status legible in ≤5s from cold open on 3G (skeleton → numbers), and in <1s warm.

## 18. Money Experience Specification

Screen = SegmentedTabs: **All · In · Out · Owed to you · You owe** over ListSection groups; SearchField + period filter chips (Today·Week·Month·Custom) shared across tabs.
The three money kinds are visually distinct *by structure, not just color*: cash rows = plain RecordCards (+/− glyphs); **Owed to you** rows = person-led cards (customer name first, amount owed, "since 12 Feb", overdue → danger accent + "overdue" word) each opening the debt detail with **[Mark as paid]** as its Primary; **You owe** mirrors with suppliers. Totals ride each tab's header ("Customers owe you Le 320,000").
Record detail (sheet M / drawer D): full facts (what, who, when, category, recorded-by — staff attribution per §28, source: "from sale"), history block if fixed, and actions: **Fix this record** (→ §J4 flow: edit-like form → ConfirmDialog stating what changes → performs reversal+re-entry, per Phase 2 §8) · Same again · (ADMIN+) nothing else — no delete anywhere.
Payment flow (debt): from debt detail → Money Input pre-filled ("Aminata owes Le 120,000") → amount (full prefilled / partial editable) → Save → "Aminata's debt: Le 45,000 remaining" toast. Never called settlement.

## 19. Stock Experience Specification

Product list: rows = name · stock count + unit · low-stock badge (amber "Low · 3 left") sorted low-first; SearchField; **service businesses**: if `track_inventory` is off for all products or none exist, Stock's empty state offers "Add a product" *and* "I don't sell products → hide Stock" (hides the tab into Menu, reversible in settings — the product never nags a caterer about shelves).
Product detail: price, stock on hand, value (estimated, labeled), then **stock history as plain sentences** ("Added 50 · 12 Feb · Le 8,000 each", "Sold 3 · yesterday", "Removed 1 · damaged — 'rain leak'"). Actions: **Add stock** (purchase flow: qty + cost prefilled from last + paid-now/You-owe-supplier toggle → §15 pattern) · **Stock check** (adjustment: "How many do you actually have?" → system computes the delta, requires a reason chip: Counted · Damaged · Other — the user states reality, MI YONE does the math) · Edit product (form) · Archive (ConfirmDialog).
Low-stock threshold editable on the product form (default 5). Damaged stock is a Stock-check reason, not a separate feature surface.

## 20. Customer Experience Specification

List (Menu → Customers): name-sorted rows + "owes you Le X" trailing where true; SearchField; + New customer (name required, phone optional — two fields, done). Detail: contact header (call/message via OS intents — no in-app chat) · **Owes you block** (amount, since-when, [Record payment] Primary, [Add debt] secondary for manual receivables) · history (their sales & payments as RecordCards) · notes (free text) · Archive. The debt block is the same object shown in Money → Owed to you — one source, two doors (§20 brief requirement). No pipelines, no tags, no CRM drift.

## 21. Supplier Experience Specification

Mirror of §20 with suppliers: "You owe Le X" block, [Pay supplier] Primary → §15 payment flow, purchase history (stock purchases + expenses), contact, notes, archive. Focused; nothing a purchase-and-payables view doesn't need.

## 22. Partner Experience Specification

One destination, three modes — visually one calm place, never a tech demo. Header: "Partner" (working name) + a quiet "sees only this business's records — see what" link (§28).
**(1) Insights feed** (default): a vertical feed of InsightCards (§23), newest first, capped and quiet (Phase 3 §9); each card self-contained. No feed = a single friendly line ("Nothing new. Ask me anything about your business.") + suggested questions.
**(2) Conversation:** entered by tapping the input bar (persistent at bottom of the feed) or any card's "Ask why". Message list: user right/brand-tint, Partner left/surface — Body type, real paragraphs, numbers in MoneyDisplay inline. **Every Partner answer carries a provenance footer chip: `From your records` (ink on brand-tint)**. Suggested-question chips ride above the input, data-aware. The Partner's tone: §17 Phase 3 — numbers first, one consideration, owner's-agency phrasing. No avatars, no typing-dots theater (a plain "…" shimmer ≤1s), no personality gimmicks.
**(3) Research:** an explicit mode toggle at the top of Conversation ("Ask about **your business** | **the web**") — switching restyles the input area with the info-slate accent and the footer chips become **`From the web · [source] · [date]`**. Flow per §24. Research answers *visually cannot* be mistaken for records answers: slate accent bar on the message edge + source list block + different footer chip. Mixing rule: when a research answer references the user's own numbers, those lines carry their own `From your records` chip — dual provenance, never blended.

## 23. AI Insight Card Specification

Anatomy (top→bottom): **statement** (H3, plain words: "Transport cost you Le 85,000 this month — more than double your usual.") · **supporting figure row** (MoneyDisplay + tiny comparison: "usual: Le 38,000/month") · **provenance chip** (`From your records`) · **one action** (Tertiary: "See transport expenses" — deep-links to the filtered view) with implicit alternates: tapping the card = "Ask why" into conversation; long-press/⋯ = Dismiss.
Look: standard Surface card, 3px clay left edge (the *only* AI marker in the product), compass icon 20px beside the statement. Explicitly absent, forever: sparkles, robots, gradients, glow, "AI" badges, animated shimmer. The card must be so calm that a screenshot could pass for a note from a sharp accountant.
Behavior: max 1 on Home, max a handful in the feed per week; dismiss is respected (no resurrection); every insight's statement is generated from a deterministic analytics fact (Phase 2 §13) — the card is the fact *phrased*, and its numbers are the fact *quoted*.

## 24. Research Experience Specification

Sequence: **Question** (research-mode input, §22) → **Searching** state: slate progress card "Looking into cement prices… this can take a minute" with the query echoed and a Cancel — the user may leave; completion lands as a feed item + optional notification (Phase 3 pattern) → **Result** card: summary paragraphs (Body) · **Sources block**: favicon-less plain list — source name · headline · date, each an outbound link · **result date stamp** ("Researched 24 Aug 2026") · footer chip `From the web`. Business-context lines inside (if any) chip separately per §22. Failure: §27 voice ("We couldn't complete this research. Try again or rephrase.") — never fabricated results, never sourceless claims presented as findings (Phase 2 AI rules). History: past research lives in the feed, searchable, clearly dated — stale results stay honestly dated rather than silently refreshed.

---

## 25. Empty States (specifications)

Template (every instance): **what this is** (H3) · **why it matters** (Body ≤2 lines) · **one Primary action** · optional one-line escape hatch. Never zeros, never guilt, always progress.

| Screen | Copy direction | Primary action | Escape hatch |
|---|---|---|---|
| Home (new) | "Let's get your first record in. Your business picture starts with one entry." | Record money in | Record money out · "Show me with example numbers" (labeled demo — pending owner decision) |
| Money | "Every Le in and out of your business will show here." | Record money in | — |
| Owed to you | "When a customer takes goods on credit, track it here so nothing is forgotten." | — (arrives via sales) | Add a debt manually |
| Stock | "Track products to see what's selling and what's running low." | Add your first product | "I don't sell products → hide Stock" |
| Customers | "Keep your customers and what they owe in one place." | Add customer | — |
| Suppliers | "Track who you buy from and what you owe them." | Add supplier | — |
| Partner | "Ask anything about your business — or I'll point out what matters as your records grow." | (suggested questions) | — |
| Search-no-results | "Nothing matches '{query}'." | Clear search | — |

## 26. Offline / Sync States

The full vocabulary, exactly as the user meets it (SyncBadge + record edges + banners; plain words only — "mutation", "queue", "sync conflict" are banned):

| State | Surface | Words |
|---|---|---|
| Online, all saved | SyncBadge hidden | — |
| Saving (in flight) | badge: cycle arrows | tap: "Saving 1 record…" |
| Saved | toast (already specced) | "Saved · Le 45,000" |
| Waiting for network | badge amber + count; record's amber edge; banner above affected lists | "Waiting for network — we'll save this automatically." |
| Back online, syncing | badge cycle arrows | "Saving 2 records…" |
| Synced after wait | badge fades; edges clear; one toast summarizing | "All saved ✓ (2 records)" |
| Failed (server rejected) | badge danger; record edge danger | "This sale couldn't be saved. Your information is still here. [Try again] [See details]" |
| Retry | on the failure surface + badge sheet "Retry all" | — |

Truth rules: a pending record is always *visibly* pending everywhere it appears (list, detail, totals: pending records are **included** in on-device list views but *marked*, and **excluded** from the server-computed Health numbers — the header notes "+1 waiting" when relevant, so the dashboard never silently disagrees with the server). Failure is always recoverable and never silently dropped. All deeper behavior (durable queue, restarts, auth expiry, multi-device) is governed by the gated Offline Capture Technical Design (Phase 3 §8) — this section fixes the *user-facing contract* that design must honor.

## 27. Error Design

Voice: human · short · actionable · calm — and **ownership-preserving: the user's input is never lost, and the error always says so.** Pattern: what happened (plain) + reassurance (your information is still here) + one action.
Placement: capture/form errors inline (danger banner in the sheet, field-level FormField errors); load errors inline where content should be (+ Retry), with cached data preferred over error screens; global failures get a full EmptyState-style error view only when there is truly nothing to show. Never: toasts for errors, stack traces, HTTP codes, "Error 500", developer nouns. The request-id hides behind "See details" for support conversations. Examples: save fail (§26 row) · load fail: "Couldn't update your numbers. Showing your last saved view. [Retry]" · auth expiry: "Please sign in again to keep your records safe." (returns to the exact screen after).

## 28. Trust Design

The four questions, answered structurally: **What happened?** — every action ends in a named confirmation with its object and amount (§13 Toast). **What is saved?** — sync truth per §26; nothing ambiguous, ever. **Who did it?** — every record carries "Recorded by Foday · 14:02" when a business has >1 member; the owner's own records show it quietly in detail view (staff attribution is information, not surveillance theater — it appears in detail + history, not shouted in lists). **What can I do next?** — every confirmation and error carries its next action (Undo · Same again · Retry · See it).
Plus: corrections show as visible history ("Fixed by Mariama · was Le 4,500 → Le 45,000"); AI provenance chips per §22–24; the "What the Partner can see" sheet lists, in plain words, the data categories the AI receives — readable in 20 seconds, linked from the Partner header and Settings; Settings → "Your data" states what's stored and why (Phase 3 §13). Business ownership shows structurally: the identity block, possessive copy, and OWNER-only surfaces (People, business settings) simply not rendering for staff.

## 29. Accessibility (system-wide, binding)

WCAG 2.1 AA floor, enforced per component and re-verified per screen: computed contrast ≥4.5:1 text / ≥3:1 large text & UI parts (all §6 tokens pre-verified); visible focus ring on every interactive element (token §6, never suppressed); full keyboard operability on desktop (§12 map) and logical DOM/focus order everywhere; touch ≥44dp (§11); screen-reader semantics: landmarks per screen, buttons labeled with object + action ("Record money in"), money announced in words (§13 MoneyDisplay), state changes via aria-live (toasts polite, errors assertive), sheets/dialogs focus-trapped with restore; text scaling to 200% reflows without loss (§5, §11); color independence: every colored meaning pairs with glyph/word (§6 law); reduced-motion per §10; plain language as an accessibility requirement (Phase 3 §14). Definition-of-done: each Phase 5 screen ships with an a11y checklist result — contrast spot-check, keyboard walk, TalkBack walk, 200% zoom pass.

## 30. Krio Readiness

All §29-adjacent i18n rules from Phase 3 §15, now binding on the design system: every string in the message catalog (zero hard-coded UI text — enforced by lint in Phase 5); full-sentence templates with placeholders (no concatenation, no mid-sentence variables assuming English word order); components tolerate ±40% length (chips wrap to two rows, buttons expand, cards grow — nothing truncates meaning; ellipsis only on user-generated names with full text in detail); dates/numbers through the locale layer; money display strings from the server; language is per-user; the §12 glossary of Phase 3 is the translation source document and gains a Krio column when translation begins. Design check per screen: "does this layout survive the longest plausible translation?"

## 31. Business Setup Experience (screen-level)

The Phase 3 §19 flow, specified per screen — one question per screen, Primary pinned bottom, progress as a quiet 7-dot trail (not "Step 3/7" bureaucracy), every screen after account skippable except business name, resumable mid-flow:

1. **Welcome** — paper ground, MI YONE mark (identity moment), one line: "Your business, in your pocket." · [Get started] · quiet [I have an account]. The only screen where the brand speaks first.
2. **Create account** — 3 FormFields (name, phone *or* email, password) · plain-words reassurance line about data safety · [Create account]. No T&C walls (link, not gate).
3. **Business name** — "What is your business called?" — single field; typing paints the answer live into the identity header mock above ("Mariama's Provisions" appearing as they type — *the ownership moment of the whole product*).
4. **Business type** — "What kind of business?" — ChipPicker (Shop · Trading · Food & catering · Services · Salon/beauty · Building & contracting · Other) · [Continue] · [Skip].
5. **Currency** — confirmation, not question: "You'll record money in Leones (Le 1,500 style preview)." · [That's right] · tiny "Change" text link.
6. **Products (optional)** — "Do you sell products you want to track?" · quick-add rows (name + price ×3 max here) · [Add these] / [Not now — you can add later] — the no-guilt path at equal visual weight minus color.
7. **First record** — "Let's put your first record in." → the *real* §16 sale sheet (or expense), plus the labeled example-data option (pending owner decision). Skippable → Home's teaching empty state takes over.
8. **Home** — arrives with confetti *not* fired (no celebration theater); instead the HealthHeader simply shows their real first number — the product keeping its promise ≤2 minutes in.

## 32. Ownership Experience — the subtle moments (inventory)

Codified touchpoints (all specced above, gathered here for review): business name as live-painted identity (§31.3) and permanent header (§17) · initial-roundel mark (§3) · possessive house voice everywhere (§3/glossary) · numbers-above-brand hierarchy (§3) · agency-attributed insights ("You cut…", §23 voice) · undo-over-confirm (§13) · visible history & Fix (§18) · "What the Partner can see" (§28) · staff attribution as the *owner's* visibility (§28) · Partner proposes, never prescribes (§22) · MI YONE brand confined to the door (§4). Restraint check per §3: the philosophy words themselves appear once (Welcome) and nowhere else.

## 33. Responsiveness & Breakpoints

Content-driven, not device-named: **base < 640px** — single column, bottom nav, sheets, FAB (the design foundation) · **≥640px** ("more room") — content max 600px centered, larger gutters, dialogs replace sheets · **≥1024px** ("desk") — sidebar appears, two-column Home, tables replace card lists, drawer details, keyboard map active · **≥1440px** — content caps at 1040px, whitespace absorbs the rest. Nothing hides or appears by width except presentation form; every capability exists at every size. Touch/pointer adaptivity follows pointer media queries, not width (a touch laptop gets touch targets).

## 34. Design Token Architecture

Two layers, machine-readable, single source:

```
tokens/
  primitives.json      color.clay.500 #9A4520 · color.clay.100 #F3E4DA · color.green.600 #1B7A4B
                       color.ink.900 #1F1912 · color.paper.50 #FAF7F1 · color.amber.700 #8A5B00
                       color.red.600 #B3261E · color.slate.600 #3D5A80 · space.1..10 (4..64)
                       radius.input 10 · radius.card 14 · radius.sheet 20 · type.* · motion.* · shadow.1/2
  semantic.json        color.background → {paper.50} · color.action.primary → {clay.500}
                       color.money.in → {green.600} · color.money.out → {ink.900}
                       color.status.warning → {amber.700} · color.status.danger → {red.600}
                       color.status.info → {slate.600} · color.brand → {clay.500} · focus.ring → {slate.600}
```

Components consume **semantic names only**; primitives are private to the token layer. Rebranding (or the owner choosing Direction B/C, or a future dark theme) = editing mappings, zero component changes. Build: tokens compile to CSS custom properties (`--color-action-primary`) consumed by Tailwind config — one generation step, no runtime cost. **Dark mode decision (charter item): v1 ships light-only.** Rationale: the paper identity *is* light; primary usage is daylight retail where light wins legibility; and a finance product should not ship a second theme at half QA depth. The token architecture makes dark purely additive later (a second semantic mapping). **⚠ Owner to ratify.**

## 35. Frontend Architecture (design only — nothing built)

| Concern | Choice | Why (each earns its place) |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Phase 1 stack decision; SSR/streaming for fast first paint on 3G; one deploy target; TS end-to-end |
| Rendering posture | App shell + client data (authenticated app = no SEO need); static marketing/door pages SSR | fast, simple, cache-friendly |
| Styling | **Tailwind CSS** consuming §34 token variables | already chosen; tokens keep it semantic; no CSS-in-JS runtime cost |
| Server state | **TanStack Query** | cache/stale-while-revalidate *is* our §10/§17 loading design; retry/backoff for §26; request dedup; no hand-rolled cache bugs in a money app |
| Client state | **React context + useState only** | after server state is handled, v1 client state is trivial (active period, open sheet); a store library would be dead weight — added only if evidence demands |
| Forms | **react-hook-form + zod** | few but real forms; zod schemas mirror API validation shapes so error surfaces match the envelope |
| API client | **generated types from FastAPI's OpenAPI (openapi-typescript) + one thin typed fetch wrapper** | the envelope (§15 Phase 2), error mapping (§27), auth handling, and Idempotency-Key header live in exactly one file; generated types make backend drift a compile error |
| i18n | **message-catalog library (next-intl class)** wired from day one, English catalog | §30 is architectural; retrofitting i18n is the classic rewrite |
| Money | server display strings + integer minor units in DTOs; **no client money arithmetic** (Phase 2 law) | the client formats nothing and computes nothing authoritative |
| Offline capture | architecture *slot*: a capture-queue module boundary (interface: enqueue/flush/observe) behind the gated technical design; v1 default implementation = in-memory retry via TanStack mutation retry + idempotency keys | honors Phase 3 §8 gate — the seam exists, the durable queue waits for its approved design |
| Errors | one ErrorBoundary per feature + the envelope mapper feeding §27 components | errors are a designed surface, not an accident |
| Testing | **Vitest + React Testing Library** (components, hooks, i18n rendering) · **Playwright** (the flagship flows: setup, ten-second sale incl. double-tap idempotency, fix-record, offline banner) · axe checks in CI | tests follow the acceptance criteria already defined, not coverage vanity |
| Explicitly absent | Redux/RTK, styled-components, component libraries (MUI/Ant — they'd *make* it a generic dashboard), chart libraries (one Sparkline needs none), moment.js-class dates (Intl + date-fns if needed) | every absence is a decision |

## 36. Frontend Structure (domain-organized)

```
frontend/src/
  app/                     # Next.js routes (thin — compose features)
    (door)/  welcome, auth, setup
    (app)/   home, money, stock, partner, menu/[customers|suppliers|insights|settings|people]
  features/
    setup/       money/        stock/        customers/     suppliers/
    partner/     research/     insights/     home/          settings/
      # each: components/ · hooks/ · api.ts (feature queries) · copy.ts (message ids) · index.ts
  shared/
    design-system/   # §13 components, tokens build output, icons
    api/             # fetch wrapper, envelope + error mapping, generated types, idempotency
    capture-queue/   # the §35 offline slot (interface + default impl)
    i18n/  hooks/  utils/
  tests/  e2e/
```

Rules: features import from `shared` and their own folder — never from each other (cross-feature needs promote to shared deliberately); route files contain no logic; design-system components contain no business logic or API calls; `copy.ts` per feature keeps every string cataloged (§30).

## 37–38. Screen Specifications & Final Screen Map

**Screen map — 19 screens/surfaces total** (evaluated from the brief's 25 candidates; combined where honesty allows):

| # | Screen | Business question | Combined from |
|---|---|---|---|
| D1 | Welcome | why am I here? | onboarding |
| D2 | Sign in / Create account (+ reset) | who am I? | authentication |
| D3 | Setup flow (§31, 6 sub-steps, one surface) | set up my business | business name/type/currency/products/first record |
| A1 | Home | how is my business doing? | — |
| A2 | Money (5 tabs) | where is my money? | money in/out/owed-to-you/you-owe → **tabs, not screens** |
| A3 | Record detail (sheet/drawer) | what is this record? | money detail |
| A4 | Capture sheet (§15/§16 variants) | record it | money in/out/payments/stock purchase → **one pattern** |
| A5 | Stock | what do I have, what's low? | — |
| A6 | Product detail (+ add/edit product form) | how is this product doing? | add stock & stock check live here as sheets |
| A7 | Partner (feed ⁄ conversation ⁄ research modes) | what should I know? | partner, conversation, research → **modes, not screens** |
| A8 | Insight detail | why is this happening? | opens as conversation with context (not a separate layout) |
| A9 | Insights (Menu) | what is changing? | month summaries + charts home |
| A10 | Customers · A11 Customer detail | who owes me? | payment = capture sheet |
| A12 | Suppliers · A13 Supplier detail | who must I pay? | payment = capture sheet |
| A14 | People & roles (OWNER/ADMIN) | who works in my business? | staff |
| A15 | Business settings | how do I control my business? | incl. hide-Stock, categories, business profile |
| A16 | Account & data | how do I control my account? | incl. "Your data", "What the Partner can see", language |
| A17 | Help | how do I…? | thin: glossary-in-plain-words + contact |

Per-screen specification: the eight core screens (D3, A1, A2, A4, A5, A6, A7, A10/11) are **fully specified in §§16–24 and 31** — each already states question, purpose, entry, primary/secondary actions, hierarchy, components, data, and all five states, plus M/D behavior and a11y notes. The remaining surfaces (D1–D2, A8–A9, A12–A17) are compositions of specified components with no novel patterns; their one-page specs follow the same template and are a Phase 5 pre-implementation checklist item per screen (no screen is built without its filled template — the template *is* §37's field list, inherited from Phase 3 §17 acceptance).
Navigation exits: every screen reaches Home in ≤2 taps; back never loses input (dirty-guard §13); deep links exist for every A-screen (insight actions and notifications need them).

## 39. Design Review (self-critique, answered honestly)

1. *Generic fintech?* No — warm paper + clay + ink with green reserved for meaning is not the navy/emerald/white default; the Partner has no chat-app styling; no component library aesthetics. Residual risk: card+bottom-nav structure is convention — accepted, because navigation convention aids Mariama; identity lives in material, color, voice.
2. *Unnecessary visual complexity?* Two shadow levels, one accent, one chart primitive, four-block dashboard — the restraint is structural.
3. *One-handed?* Capture, nav, save, undo all bottom-zone (§11); rare/destructive actions deliberately out of reach.
4. *Understandable without training?* Every screen = one question; empty states teach; vocabulary is shop-floor; setup demonstrates the core loop within 2 minutes.
5. *Ten-second sale?* 3–5 taps specced (§16) with a timed acceptance test — measurable, not assumed.
6. *Ownership communicated?* §32 inventory — grammar, hierarchy, identity, control; verified per-screen by the Phase 3 §17 question.
7. *AI useful, not decorative?* Insight = deterministic fact + plain phrasing + one action; provenance chips; no AI theater (§23 bans).
8. *Low-bandwidth operable?* System fonts, no images in flows, one-request dashboard, cached-first rendering, pending-capture contract (§26).
9. *Krio-ready?* Catalog-only strings, ±40% tolerance, templates, per-user language (§30).
10. *Desktop same product?* Same IA, same components re-laid; nothing exists on one platform only (§12, §33).
11. *Financial states honest?* Cash vs profit separation (Phase 3 §6.1) carried into HealthHeader spec; pending records excluded from server numbers and visibly marked (§26); estimated labels mandatory (§19).
12. *A11y achievable?* Contrast pre-computed and passing; patterns (focus, traps, live regions) specified per component, checklist gated (§29).
13. *Scales as MI YONE grows?* Token indirection (§34), feature isolation (§36), component inventory with a governed add-process, provider-agnostic Partner surfaces — new domains (future phases) add features without touching existing ones.

**Weakest points, stated plainly:** (a) the identity rests on color/material/voice without a custom typeface or approved logo — the logo work (§4) matters; (b) Direction A's warm neutrals demand discipline (tokens enforce it, but Phase 5 must not introduce off-token grays); (c) light-only is a real trade-off for night-market users — revisit dark mode with real user feedback.

## 40. Final Deliverable Summary & Remaining Decisions

Delivered in this document: visual direction (§2, recommended: Ink & Clay) · brand philosophy (§1) · color system (§6) · typography (§5) · spacing (§7) · shape/elevation (§8) · iconography (§9) · motion (§10) · tokens (§34) · 22 component specs (§13–15) · mobile architecture (§11) · desktop architecture (§12) · navigation spec (§33 + Phase 3 §5) · Home (§17) · Money (§18) · Stock (§19) · Customers (§20) · Suppliers (§21) · Partner (§22–23) · Research (§24) · Onboarding (§31) · state families (§25–27) · offline states (§26) · accessibility (§29) · localization (§30) · frontend architecture (§35) · folder structure (§36) · screen map (§37–38) · rationale & self-review (§2, §39).

**Decision gate status (updated at owner review):**
1. **Visual direction — ✅ DECIDED: Ink & Clay approved, palette locked** (§2).
2. **Dark/light — ✅ DECIDED: light-only v1 ratified**; dark remains architecturally additive (§34).
3. **Logo — pending**; must satisfy §4 (geometric, one-color-capable, 16px/48px). May proceed in parallel with Phase 5; blocks only the door/auth screens.
4. **Example-data onboarding option — ✅ DECIDED: include it** (labeled demo, one-tap removable, never touches real ledgers).
5. **Session mechanism — ✅ DECIDED: server-side opaque sessions** (Phase 2 §17; backend M1 unblocked).
6. **Partner name — pending**; "Partner" remains the working name.

**Owner-ratified Phase 5 implementation order** (binding): Tokens → Design system → App shell/navigation → Capture system → Home → Money/Stock → Customers/Suppliers → Partner/Research → Settings/People/Help → accessibility + responsive + offline states → E2E acceptance. **The ten-second sale is the first serious implementation benchmark** — it exercises typography, keypad, sheet, money formatting, state management, API integration, idempotency, offline behavior, toast/undo, responsiveness, and accessibility at once. Pages are never the starting point; foundations are.

---

*End of Phase 4 design specification. STOP — no frontend code, no screens, no components have been implemented. Awaiting owner review and the decisions above before Phase 5 (implementation).*
