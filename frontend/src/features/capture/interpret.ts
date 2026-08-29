// Natural-language record interpreter — DETERMINISTIC understanding + validation
// (no LLM, no guessing; per the project's law the app computes truth, AI only
// ever explains it — and this layer is the app). Parses English / Krio / mixed
// phrases and works out WHAT the owner means, WHERE it belongs, and WHETHER it
// looks right:
//   "Sold 5 bags of rice at 350 each"        → sale
//   "Bought 20 bags of rice for 300 each"    → purchase (stock in + expense)
//   "Paid 100,000 for transport"             → expense (category matched)
//   "Aminata owes me 50,000"                 → receivable (credit record)
//   "Rice 350"                                → ambiguous — ASK, never guess
// Safety rules:
//   - Never invent a product, price, quantity, customer, or payment status:
//     everything is stated in the text, matched against the business's OWN
//     records, or raised as an issue for the owner to resolve.
//   - Issues carry a severity: "block" (record cannot be saved until resolved)
//     or "warn" (unusual but possibly intentional — the owner may confirm
//     anyway; we never auto-reject their numbers).
//   - Validation uses existing business data (catalogue prices, live stock,
//     recent transactions) but never overrides what the owner confirmed.
//   - Nothing is saved from here — the interpretation fills the normal capture
//     UI as an editable confirmation preview, and recording goes through the
//     EXISTING endpoints (server-validated, idempotent).
// Pure module: no React, no API calls — fully unit-testable.

export interface InterpretProduct {
  id: string;
  name: string;
  selling_price: { amount_minor: number };
  track_inventory: boolean;
  stock?: number; // live stock, when known — enables the low-stock warning
  cost_price?: { amount_minor: number }; // enables purchase-cost fallback/validation
}

export interface InterpretParty {
  id: string;
  name: string;
}
export type InterpretCustomer = InterpretParty;

export interface InterpretCategory {
  id: string;
  name: string;
}

export interface InterpretRecentTx {
  type: "INCOME" | "EXPENSE";
  amount_minor: number;
  occurred_at: string; // ISO
}

export interface InterpretContext {
  products: InterpretProduct[];
  customers: InterpretParty[];
  suppliers?: InterpretParty[];
  expenseCategories?: InterpretCategory[];
  recentTransactions?: InterpretRecentTx[];
  now?: Date; // injectable for tests
}

export type EntryIntent = "sale" | "purchase" | "expense" | "receivable" | "payable";

export type IssueSeverity = "block" | "warn";

export type InterpretIssueId =
  | "notUnderstood" // nothing record-like found — do not apply anything
  | "ambiguousIntent" // could be a sale or a purchase — ask, never guess
  | "missingAmount" // no total could be determined from the text
  | "missingQuantity" // per-unit price but no quantity stated
  | "checkQuantity" // product named without quantity — defaulted to 1, confirm
  | "usedCatalogPrice" // no price in text — used the product's own set price
  | "usedCatalogCost" // no cost in text — used the product's own cost price
  | "conflictTotal" // stated total ≠ quantity × unit price — owner must decide
  | "unknownProduct" // text names a product that is not in the records
  | "productRequired" // a purchase must point at a real product
  | "ambiguousProduct" // more than one product matches — owner must pick
  | "ambiguousCustomer" // more than one customer matches — owner must pick
  | "needCustomer" // credit record but no customer identified
  | "needSupplier" // owing a supplier but no supplier identified
  | "unusualPrice" // price far from the business's own recorded price
  | "insufficientStock" // sale quantity exceeds what stock says is left
  | "possibleDuplicate" // same amount recorded minutes ago
  | "unclearNumbers"; // extra numbers we could not place

export interface InterpretIssue {
  id: InterpretIssueId;
  severity: IssueSeverity;
  params?: Record<string, string>;
}

export interface InterpretedEntry {
  understood: boolean;
  intent: EntryIntent | null; // null → ambiguous, ask the owner (never guess)
  // shared numbers
  quantity: number | null;
  unitPriceMinor: number | null; // sale price or purchase cost, per unit
  totalMinor: number | null; // null = owner must supply it
  // sale
  payment: "PAID" | "CREDIT" | "PARTIAL";
  paidNowMinor: number | null;
  // purchase
  paidSupplier: boolean; // false → owe the supplier (payable)
  // matches against the business's own records
  productId: string | null;
  productCandidateIds: string[];
  productQuery: string | null;
  customerId: string | null;
  customerCandidateIds: string[];
  supplierId: string | null;
  supplierCandidateIds: string[];
  categoryId: string | null; // expense category
  noteText: string | null;
  issues: InterpretIssue[];
}

// Back-compat shape for the sale-only entry point.
export type InterpretedSale = InterpretedEntry;

// ---------------------------------------------------------------------------
// Vocabulary (English + Krio). Krio spellings vary — we accept common forms.
// ---------------------------------------------------------------------------

const SALE_VERBS = new Set(["sold", "sell", "sells", "sel", "tek", "take"]);
const BUY_VERBS = new Set(["bought", "buy", "buys", "purchase", "purchased", "restock", "restocked", "order", "ordered", "bay", "bai"]);
const SPEND_VERBS = new Set(["spent", "spend"]);

const UNIT_WORDS = new Set([
  "bag", "bags", "piece", "pieces", "pcs", "pc", "kg", "kilo", "kilos",
  "cup", "cups", "packet", "packets", "sachet", "sachets", "bottle", "bottles",
  "carton", "cartons", "bar", "bars", "tin", "tins", "box", "boxes",
  "crate", "crates", "loaf", "loaves", "gallon", "gallons", "unit", "units", "dozen",
]);

const EACH_WORDS = new Set(["each", "apiece", "per"]);
const AT_WORDS = new Set(["at", "@"]);
const TOTAL_WORDS = new Set(["total", "altogether", "all"]);
const SKIP_WORDS = new Set(["of", "the", "a", "di", "dem", "den", "im", "i", "we", "customer", "ah", "and", "en", "an", "from", "to", "me", "mi"]);

// Credit ("owes") markers — incl. Krio "trust" (buy on credit).
const CREDIT_WORDS = new Set(["credit", "owe", "owes", "owing", "trust", "trusts", "later"]);
const OWE_WORDS = new Set(["owe", "owes", "owing"]);
const PAID_WORDS = new Set(["paid", "cash"]);

// Number words. One combined map — mixed English/Krio phrases are common.
const NUM_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  // Krio forms
  wan: 1, tu: 2, tri: 3, faiv: 5, fayv: 5, siks: 6, sevin: 7, nain: 9,
};
const NUM_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
  // Krio forms
  twenti: 20, torti: 30, foti: 40, fifti: 50, sixti: 60, seventi: 70, eyti: 80, nainti: 90,
};
const HUNDRED_WORDS = new Set(["hundred", "hundrid", "ondred", "andred", "undred"]);
const THOUSAND_WORDS = new Set(["thousand", "tousand", "tawzin", "tozin", "towsan", "tousan"]);
const NUM_CONNECTORS = new Set(["and", "en", "an"]);

type Tok = { kind: "num"; value: number } | { kind: "word"; text: string };

function isScaleWord(w: string): boolean {
  return HUNDRED_WORDS.has(w) || THOUSAND_WORDS.has(w);
}

function isNumberWord(w: string): boolean {
  return w in NUM_UNITS || w in NUM_TENS || isScaleWord(w);
}

function isDigits(w: string): boolean {
  return /^\d+(\.\d+)?$/.test(w);
}

// ---------------------------------------------------------------------------
// Tokenizer: normalize → raw words → merge number-word runs into numeric tokens.
// ---------------------------------------------------------------------------

function rawWords(text: string): string[] {
  const lowered = text
    .toLowerCase()
    // digit grouping: 1,750 → 1750
    .replace(/(\d),(?=\d)/g, "$1")
    // glued currency/multiplier: le350 → le 350, 3x → 3 x
    .replace(/\ble(\d)/g, "le $1")
    .replace(/(\d)x\b/g, "$1 x")
    .replace(/[^a-z0-9.@]+/g, " ")
    .trim();
  if (!lowered) return [];
  return lowered
    .split(/\s+/)
    // sentence punctuation clings to words ("2,000." / ".rice") — strip it
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    // currency markers carry no information (amounts are in Leones)
    .filter((w) => w !== "" && w !== "le" && w !== "leone" && w !== "leones" && w !== "sle" && w !== "nle");
}

// Krio "fo" is both "four" and "for". Deterministic rule:
//   fo + scale word ("fo ondred")            → the number 4
//   fo + other number word/digit ("fo 350")  → the word "for"
//   fo + unit or known noun ("fo bag rice")  → the number 4
//   otherwise                                → the word "for"
function resolveFo(words: string[], nounTokens: Set<string>): string[] {
  return words.map((w, i) => {
    if (w !== "fo") return w;
    const next = words[i + 1];
    if (next === undefined) return "for";
    if (isScaleWord(next)) return "__four__";
    if (isNumberWord(next) || isDigits(next)) return "for";
    if (UNIT_WORDS.has(next) || nounTokens.has(next)) return "__four__";
    return "for";
  });
}

function tokenize(text: string, nounTokens: Set<string>): Tok[] {
  const words = resolveFo(rawWords(text), nounTokens);
  const toks: Tok[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w === "__four__" || isNumberWord(w)) {
      const [value, consumed] = readNumberRun(words, i);
      toks.push({ kind: "num", value });
      i += consumed;
      continue;
    }
    if (isDigits(w)) {
      toks.push({ kind: "num", value: Number(w) });
      i += 1;
      continue;
    }
    toks.push({ kind: "word", text: w });
    i += 1;
  }
  return toks;
}

// Combine a run of number words starting at index i.
// "three hundred and fifty" → 350; "tri ondred en fifti" → 350; "two thousand five" → 2005.
function readNumberRun(words: string[], start: number): [number, number] {
  let current = 0;
  let total = 0;
  let i = start;
  let consumedAny = false;
  while (i < words.length) {
    const w = words[i];
    if (w === "__four__") {
      current += 4;
      consumedAny = true;
    } else if (w in NUM_UNITS) {
      current += NUM_UNITS[w];
      consumedAny = true;
    } else if (w in NUM_TENS) {
      current += NUM_TENS[w];
      consumedAny = true;
    } else if (HUNDRED_WORDS.has(w)) {
      current = (current || 1) * 100;
      consumedAny = true;
    } else if (THOUSAND_WORDS.has(w)) {
      total += (current || 1) * 1000;
      current = 0;
      consumedAny = true;
    } else if (NUM_CONNECTORS.has(w) && consumedAny && i + 1 < words.length && (isNumberWord(words[i + 1]) || words[i + 1] === "__four__")) {
      // "and" only continues the run when a number word follows
    } else if (isDigits(w) && !consumedAny) {
      current = Number(w);
      consumedAny = true;
    } else {
      break;
    }
    i += 1;
  }
  return [total + current, i - start];
}

// ---------------------------------------------------------------------------
// Matching against the business's own records (never invent).
// ---------------------------------------------------------------------------

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !UNIT_WORDS.has(t) && !/^\d/.test(t));
}

export function productNounTokens(products: InterpretProduct[], parties: InterpretParty[]): Set<string> {
  const set = new Set<string>();
  for (const p of products) for (const t of nameTokens(p.name)) set.add(t);
  for (const c of parties) for (const t of nameTokens(c.name)) set.add(t);
  return set;
}

function matchParties(parties: InterpretParty[], wordSet: Set<string>): InterpretParty[] {
  return parties.filter((p) => nameTokens(p.name).some((t) => wordSet.has(t)));
}

const toMinorUnits = (wholeLeones: number): number => Math.round(wholeLeones * 100);

const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const UNUSUAL_HIGH = 1.5; // ≥150% of the recorded price
const UNUSUAL_LOW = 0.5; // ≤50% of the recorded price

// ---------------------------------------------------------------------------
// The interpreter.
// ---------------------------------------------------------------------------

export function interpretEntry(
  text: string,
  ctx: InterpretContext,
  forcedIntent?: EntryIntent,
): InterpretedEntry {
  const products = ctx.products;
  const customers = ctx.customers;
  const suppliers = ctx.suppliers ?? [];
  const categories = ctx.expenseCategories ?? [];

  const issues: InterpretIssue[] = [];
  const block = (id: InterpretIssueId, params?: Record<string, string>) => issues.push({ id, severity: "block", params });
  const warn = (id: InterpretIssueId, params?: Record<string, string>) => issues.push({ id, severity: "warn", params });

  const nouns = productNounTokens(products, [...customers, ...suppliers]);
  const toks = tokenize(text, nouns);
  const wordSet = new Set(toks.filter((t): t is { kind: "word"; text: string } => t.kind === "word").map((t) => t.text));
  const bigrams: string[] = [];
  for (let i = 0; i < toks.length - 1; i += 1) {
    const a = toks[i];
    const b = toks[i + 1];
    if (a.kind === "word" && b.kind === "word") bigrams.push(`${a.text} ${b.text}`);
  }

  // ---- parties -------------------------------------------------------------
  const customerMatches = matchParties(customers, wordSet);
  let customerId: string | null = customerMatches.length === 1 ? customerMatches[0].id : null;
  const customerCandidateIds = customerMatches.map((c) => c.id);
  if (customerMatches.length > 1) warn("ambiguousCustomer");

  const supplierMatches = matchParties(suppliers, wordSet);
  const supplierId: string | null = supplierMatches.length === 1 ? supplierMatches[0].id : null;
  const supplierCandidateIds = supplierMatches.map((s) => s.id);

  // ---- products ------------------------------------------------------------
  const partyTokens = new Set([...customers, ...suppliers].flatMap((c) => nameTokens(c.name)));
  const scored = products
    .map((p) => ({ p, score: nameTokens(p.name).filter((t) => wordSet.has(t) && !partyTokens.has(t)).length }))
    .filter((s) => s.score > 0);
  const bestScore = Math.max(0, ...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === bestScore);
  const matchedProduct = winners.length === 1 ? winners[0].p : null;
  let productId: string | null = matchedProduct ? matchedProduct.id : null;
  const productCandidateIds = winners.length > 1 ? winners.map((s) => s.p.id) : [];
  let productQuery: string | null = null;

  // ---- expense category match ---------------------------------------------
  const catScored = categories
    .map((c) => ({
      c,
      score: nameTokens(c.name).filter((t) => t !== "expense" && t !== "general" && wordSet.has(t)).length,
    }))
    .filter((s) => s.score > 0);
  const matchedCategory = catScored.length >= 1 ? catScored[0].c : null;

  // ---- numbers: assign roles ----------------------------------------------
  let quantity: number | null = null;
  let unitPrice: number | null = null; // whole leones (price for sale, cost for purchase)
  let statedTotal: number | null = null;
  let paidAmount: number | null = null;
  const leftovers: number[] = [];

  const wordAt = (i: number): string | null => {
    const t = toks[i];
    return t && t.kind === "word" ? t.text : null;
  };

  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (t.kind !== "num") continue;
    const prev = wordAt(i - 1);
    const next = wordAt(i + 1);
    const isInt = Number.isInteger(t.value);

    if (next !== null && EACH_WORDS.has(next)) {
      if (unitPrice === null) unitPrice = t.value;
      else leftovers.push(t.value);
    } else if (prev !== null && AT_WORDS.has(prev)) {
      if (unitPrice === null) unitPrice = t.value;
      else leftovers.push(t.value);
    } else if (prev !== null && (prev === "paid" || prev === "pay")) {
      if (paidAmount === null) paidAmount = t.value;
      else leftovers.push(t.value);
    } else if (prev === "for") {
      // "for 350 each" was caught by the EACH rule; plain "for X" reads as a total
      if (statedTotal === null) statedTotal = t.value;
      else leftovers.push(t.value);
    } else if (next !== null && (UNIT_WORDS.has(next) || nouns.has(next) || next === "x")) {
      if (quantity === null && isInt && t.value > 0 && t.value <= 9999) quantity = t.value;
      else leftovers.push(t.value);
    } else if (next !== null && TOTAL_WORDS.has(next)) {
      if (statedTotal === null) statedTotal = t.value;
      else leftovers.push(t.value);
    } else if (prev !== null && (SALE_VERBS.has(prev) || BUY_VERBS.has(prev)) && isInt && t.value > 0 && t.value <= 9999) {
      if (quantity === null) quantity = t.value;
      else leftovers.push(t.value);
    } else {
      leftovers.push(t.value);
    }
  }

  // One unplaced number with no explicit total → it is the stated total
  // (still shown for confirmation, never silently saved).
  if (statedTotal === null && leftovers.length === 1) statedTotal = leftovers.shift() ?? null;
  if (leftovers.length > 0) warn("unclearNumbers");

  // ---- payment / credit markers -------------------------------------------
  const creditStated =
    [...wordSet].some((w) => CREDIT_WORDS.has(w)) ||
    bigrams.some((b) => ["no pay", "nor pay", "not paid", "pay later", "go pay", "never pay", "on credit", "for credit"].includes(b));

  // ---- intent (never guessed: ambiguous → ask) ----------------------------
  const sawSaleVerb = [...wordSet].some((w) => SALE_VERBS.has(w));
  const sawBuyVerb = [...wordSet].some((w) => BUY_VERBS.has(w));
  const sawSpendVerb = [...wordSet].some((w) => SPEND_VERBS.has(w));
  const sawOwe = [...wordSet].some((w) => OWE_WORDS.has(w));
  const sawPaidWord = [...wordSet].some((w) => PAID_WORDS.has(w) || w === "pay");
  const customerish = wordSet.has("customer") || customerMatches.length > 0;
  const iOwe = bigrams.some((b) => ["i owe", "a owe", "we owe", "ah owe"].includes(b));

  let detectedIntent: EntryIntent | null = null;
  if (sawSaleVerb) detectedIntent = "sale";
  else if (sawBuyVerb) detectedIntent = customerish ? "sale" : "purchase";
  else if (sawOwe) detectedIntent = iOwe || (supplierMatches.length > 0 && customerMatches.length === 0) ? "payable" : "receivable";
  else if (sawSpendVerb) detectedIntent = "expense";
  else if (sawPaidWord && wordSet.has("for")) detectedIntent = customerish ? "sale" : matchedProduct || productCandidateIds.length > 0 ? "purchase" : "expense";
  else if (matchedCategory && !matchedProduct && productCandidateIds.length === 0) detectedIntent = "expense";
  // else null — e.g. "Rice 350": sale or purchase? ask.

  // A forced intent (the owner answered our question) never makes gibberish
  // "understood" — understanding is judged on the text alone.
  const sawNumber = toks.some((t) => t.kind === "num");
  const understood =
    detectedIntent !== null || sawNumber || productId !== null || productCandidateIds.length > 0 || customerMatches.length > 0;
  const intent: EntryIntent | null = forcedIntent ?? detectedIntent;

  const emptyResult = (only: InterpretIssue[]): InterpretedEntry => ({
    understood: false,
    intent: null,
    quantity: null, unitPriceMinor: null, totalMinor: null,
    payment: "PAID", paidNowMinor: null, paidSupplier: true,
    productId: null, productCandidateIds: [], productQuery: null,
    customerId: null, customerCandidateIds: [],
    supplierId: null, supplierCandidateIds: [],
    categoryId: null, noteText: null,
    issues: only,
  });

  if (!understood) return emptyResult([{ id: "notUnderstood", severity: "block" }]);

  if (intent === null) {
    // Something record-like, but we cannot tell sale from purchase. ASK.
    block("ambiguousIntent");
    return {
      ...emptyResult(issues),
      understood: true,
      quantity,
      unitPriceMinor: unitPrice !== null ? toMinorUnits(unitPrice) : null,
      totalMinor: null,
      productId,
      productCandidateIds,
      customerId,
      customerCandidateIds,
      supplierId,
      supplierCandidateIds,
      issues,
    };
  }

  // ---- ambiguous / unknown product ----------------------------------------
  if (productCandidateIds.length > 1) {
    issues.push({ id: "ambiguousProduct", severity: intent === "purchase" ? "block" : "warn" });
  }
  if (productId === null && productCandidateIds.length === 0 && (intent === "sale" || intent === "purchase")) {
    // quantity+unit present but nothing matched → surface the word we saw
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.kind !== "word" || !UNIT_WORDS.has(t.text)) continue;
      for (let j = i + 1; j < Math.min(i + 3, toks.length); j += 1) {
        const cand = toks[j];
        if (cand.kind !== "word") break;
        if (SKIP_WORDS.has(cand.text)) continue;
        if (!nouns.has(cand.text) && !UNIT_WORDS.has(cand.text) && !isNumberWord(cand.text) && !partyTokens.has(cand.text)
            && !EACH_WORDS.has(cand.text) && !AT_WORDS.has(cand.text) && cand.text !== "for" && !PAID_WORDS.has(cand.text) && !CREDIT_WORDS.has(cand.text)) {
          productQuery = cand.text;
          warn("unknownProduct", { name: cand.text });
        }
        break;
      }
      if (productQuery) break;
    }
  }
  if (intent === "purchase" && matchedProduct === null) {
    // Stock can only come in against a real product — no inventing one.
    block("productRequired");
  }

  // ---- reconcile amounts (deterministic arithmetic on stated numbers) -----
  let totalMinor: number | null = null;
  let unitPriceMinor: number | null = unitPrice !== null ? toMinorUnits(unitPrice) : null;

  if (intent === "sale" || intent === "purchase") {
    if (unitPrice !== null && quantity !== null) {
      const computed = toMinorUnits(unitPrice * quantity);
      const stated = statedTotal !== null ? toMinorUnits(statedTotal) : null;
      if (stated !== null && stated !== computed) {
        block("conflictTotal", { computed: String(unitPrice * quantity), stated: String(statedTotal) });
        totalMinor = null; // owner must decide — never guess between two stated numbers
      } else {
        totalMinor = computed;
      }
    } else if (unitPrice !== null && quantity === null) {
      block("missingQuantity");
      totalMinor = statedTotal !== null ? toMinorUnits(statedTotal) : null;
    } else if (statedTotal !== null) {
      totalMinor = toMinorUnits(statedTotal);
    } else if (paidAmount !== null && !creditStated) {
      totalMinor = toMinorUnits(paidAmount);
    }

    if (intent === "sale") {
      // Product named but no price anywhere → offer the product's OWN set price
      // (same as tapping its chip), clearly flagged for review.
      if (matchedProduct && totalMinor === null && unitPrice === null && statedTotal === null && paidAmount === null) {
        const qty = quantity ?? 1;
        unitPriceMinor = matchedProduct.selling_price.amount_minor;
        totalMinor = unitPriceMinor * qty;
        warn("usedCatalogPrice");
      }
      // Product named without a quantity, but the amount is known → default 1
      // like the manual flow, and say so.
      if (matchedProduct && quantity === null && totalMinor !== null) {
        quantity = 1;
        if (!issues.some((x) => x.id === "missingQuantity")) warn("checkQuantity");
      }
    }

    if (intent === "purchase" && matchedProduct) {
      if (quantity === null && !issues.some((x) => x.id === "missingQuantity")) block("missingQuantity");
      // No cost stated → fall back to the product's own recorded cost, flagged.
      if (unitPriceMinor === null && totalMinor === null && matchedProduct.cost_price) {
        unitPriceMinor = matchedProduct.cost_price.amount_minor;
        if (quantity !== null) totalMinor = unitPriceMinor * quantity;
        warn("usedCatalogCost");
      }
      // Unit cost derivable from a stated total.
      if (unitPriceMinor === null && totalMinor !== null && quantity !== null && totalMinor % quantity === 0) {
        unitPriceMinor = totalMinor / quantity;
      }
    }
  } else if (intent === "expense" || intent === "receivable" || intent === "payable") {
    const single = paidAmount ?? statedTotal;
    totalMinor = single !== null ? toMinorUnits(single) : null;
  }

  if (totalMinor === null && !issues.some((x) => x.id === "conflictTotal" || x.id === "missingQuantity")) {
    block("missingAmount");
  }
  if (totalMinor !== null && (totalMinor <= 0 || totalMinor > 100_000_000_000)) {
    totalMinor = null;
    block("missingAmount");
  }

  // ---- validation against the business's OWN records ----------------------
  // Unusual price/cost (only when the owner stated one — never against fallbacks).
  if (matchedProduct && unitPrice !== null) {
    const usualMinor = intent === "purchase" ? matchedProduct.cost_price?.amount_minor : matchedProduct.selling_price.amount_minor;
    const enteredMinor = toMinorUnits(unitPrice);
    if (usualMinor && usualMinor > 0) {
      const ratio = enteredMinor / usualMinor;
      if (ratio >= UNUSUAL_HIGH || ratio <= UNUSUAL_LOW) {
        warn("unusualPrice", {
          product: matchedProduct.name,
          usual: String(Math.round(usualMinor / 100)),
          entered: String(unitPrice),
        });
      }
    }
  }
  // Selling more than stock says is left (owner may still confirm — shops are messy).
  if (intent === "sale" && matchedProduct?.track_inventory && typeof matchedProduct.stock === "number" && quantity !== null && quantity > matchedProduct.stock) {
    warn("insufficientStock", { have: String(matchedProduct.stock) });
  }
  // Same amount recorded minutes ago → possible duplicate (confirm anyway allowed).
  if (totalMinor !== null && ctx.recentTransactions && ctx.recentTransactions.length > 0) {
    const now = (ctx.now ?? new Date()).getTime();
    const wantType = intent === "sale" || intent === "receivable" ? "INCOME" : "EXPENSE";
    const dup = ctx.recentTransactions.some(
      (tx) => tx.type === wantType && tx.amount_minor === totalMinor && now - new Date(tx.occurred_at).getTime() < DUPLICATE_WINDOW_MS && now - new Date(tx.occurred_at).getTime() >= 0,
    );
    if (dup) warn("possibleDuplicate");
  }

  // ---- payment resolution --------------------------------------------------
  let payment: "PAID" | "CREDIT" | "PARTIAL" = "PAID";
  let paidNowMinor: number | null = null;
  let paidSupplier = true;
  const paidMinor = paidAmount !== null ? toMinorUnits(paidAmount) : null;

  if (intent === "sale") {
    if (creditStated) {
      if (paidMinor !== null && totalMinor !== null && paidMinor >= totalMinor) payment = "PAID";
      else if (paidMinor !== null && paidMinor > 0) {
        payment = "PARTIAL";
        paidNowMinor = paidMinor;
      } else payment = "CREDIT";
    } else if (paidMinor !== null && totalMinor !== null && paidMinor < totalMinor) {
      payment = "PARTIAL";
      paidNowMinor = paidMinor;
    }
    if ((payment === "CREDIT" || payment === "PARTIAL") && customerId === null) block("needCustomer");
  }
  if (intent === "purchase") {
    paidSupplier = !creditStated;
    if (!paidSupplier && supplierId === null) block("needSupplier");
  }
  if (intent === "receivable" && customerId === null) block("needCustomer");
  if (intent === "payable" && supplierId === null) block("needSupplier");

  // ---- expense extras ------------------------------------------------------
  let categoryId: string | null = null;
  let noteText: string | null = null;
  if (intent === "expense") {
    categoryId = matchedCategory?.id ?? null;
    // description: the words after "for/on" when they aren't just the category
    const m = /(?:for|on)\s+(.{2,60})$/i.exec(text.trim());
    if (m) {
      const tail = m[1].replace(/[.,;!?]+$/, "").trim();
      const isJustCategory = matchedCategory ? tail.toLowerCase() === matchedCategory.name.toLowerCase() : false;
      if (tail && !isJustCategory && !/^\d[\d,. ]*$/.test(tail)) noteText = tail;
    }
  }

  return {
    understood: true,
    intent,
    quantity, unitPriceMinor, totalMinor,
    payment, paidNowMinor, paidSupplier,
    productId, productCandidateIds, productQuery,
    customerId, customerCandidateIds,
    supplierId, supplierCandidateIds,
    categoryId, noteText,
    issues,
  };
}

// Back-compat sale-only entry point (used by earlier tests): interpret with the
// intent fixed to "sale".
export function interpretSale(
  text: string,
  products: InterpretProduct[],
  customers: InterpretParty[],
): InterpretedEntry {
  return interpretEntry(text, { products, customers }, "sale");
}

export function hasBlockingIssues(r: InterpretedEntry): boolean {
  return r.issues.some((i) => i.severity === "block");
}
