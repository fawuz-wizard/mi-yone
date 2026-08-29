// Natural-language sale interpreter — DETERMINISTIC input assistance (no AI, no
// guessing). Parses English / Krio / mixed phrases like:
//   "Sold 3 bags of rice at Le 350 each"
//   "Customer bought 5 bags of rice, paid 1,750"
//   "Ah sell tri bag rice fo tri ondred en fifti each"
// into a DRAFT that pre-fills the existing capture sheet. Safety rules:
//   - Never invent a product, price, quantity, or payment status: everything is
//     either stated in the text, matched against the business's own records, or
//     flagged as an issue for the owner to resolve.
//   - The draft is never saved directly — it fills the normal capture form, the
//     owner reviews/edits, and recording goes through the EXISTING sale path
//     (server-validated, idempotent). This module computes no financial truth;
//     like the product-chip prefill, the server re-validates everything.
// Pure module: no React, no API calls — fully unit-testable.

export interface InterpretProduct {
  id: string;
  name: string;
  selling_price: { amount_minor: number };
  track_inventory: boolean;
}

export interface InterpretCustomer {
  id: string;
  name: string;
}

export type InterpretIssueId =
  | "notUnderstood" // nothing sale-like found — do not apply anything
  | "missingAmount" // no total could be determined from the text
  | "missingQuantity" // price given per-unit but no quantity stated
  | "checkQuantity" // product named without a quantity — defaulted to 1, confirm
  | "usedCatalogPrice" // no price in text — used the product's own set price, confirm
  | "conflictTotal" // stated total ≠ quantity × unit price — owner must decide
  | "unknownProduct" // text names a product that is not in the records
  | "ambiguousProduct" // more than one product matches — owner must pick
  | "ambiguousCustomer" // more than one customer matches — owner must pick
  | "needCustomer" // credit sale but no customer identified
  | "unclearNumbers"; // extra numbers we could not place — check the amounts

export interface InterpretIssue {
  id: InterpretIssueId;
  params?: Record<string, string>;
}

export interface InterpretedSale {
  understood: boolean;
  productId: string | null;
  productCandidateIds: string[]; // ≥2 when ambiguous
  productQuery: string | null; // the word(s) that looked like a product
  quantity: number | null;
  unitPriceMinor: number | null;
  totalMinor: number | null; // whole draft amount; null = owner must enter it
  payment: "PAID" | "CREDIT" | "PARTIAL";
  paidNowMinor: number | null; // for PARTIAL
  customerId: string | null;
  customerCandidateIds: string[];
  issues: InterpretIssue[];
}

// ---------------------------------------------------------------------------
// Vocabulary (English + Krio). Krio spellings vary — we accept common forms.
// ---------------------------------------------------------------------------

const SALE_VERBS = new Set(["sold", "sell", "sells", "sel", "bought", "buy", "buys", "take", "tek"]);

const UNIT_WORDS = new Set([
  "bag", "bags", "piece", "pieces", "pcs", "pc", "kg", "kilo", "kilos",
  "cup", "cups", "packet", "packets", "sachet", "sachets", "bottle", "bottles",
  "carton", "cartons", "bar", "bars", "tin", "tins", "box", "boxes",
  "crate", "crates", "loaf", "loaves", "gallon", "gallons", "unit", "units", "dozen",
]);

const EACH_WORDS = new Set(["each", "apiece", "per"]);
const AT_WORDS = new Set(["at", "@"]);
const TOTAL_WORDS = new Set(["total", "altogether", "all"]);
const SKIP_WORDS = new Set(["of", "the", "a", "di", "dem", "den", "im", "i", "we", "customer", "ah", "and", "en", "an"]);

// Credit ("owes you") markers — incl. Krio "trust" (buy on credit) and "owe".
const CREDIT_WORDS = new Set(["credit", "owe", "owes", "owing", "trust", "trusts", "later"]);
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
    // currency markers carry no information (amounts are in Leones)
    .filter((w) => w !== "le" && w !== "leone" && w !== "leones" && w !== "sle" && w !== "nle" && w !== ".");
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
    if (w === "__four__") {
      // A resolved Krio "fo" (=4) can still lead a word-number run: "fo ondred" = 400.
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
    if (isNumberWord(w)) {
      const [value, consumed] = readNumberRun(words, i);
      toks.push({ kind: "num", value });
      i += consumed;
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

export function productNounTokens(products: InterpretProduct[], customers: InterpretCustomer[]): Set<string> {
  const set = new Set<string>();
  for (const p of products) for (const t of nameTokens(p.name)) set.add(t);
  for (const c of customers) for (const t of nameTokens(c.name)) set.add(t);
  return set;
}

const toMinorUnits = (wholeLeones: number): number => Math.round(wholeLeones * 100);

// ---------------------------------------------------------------------------
// The interpreter.
// ---------------------------------------------------------------------------

export function interpretSale(
  text: string,
  products: InterpretProduct[],
  customers: InterpretCustomer[],
): InterpretedSale {
  const issues: InterpretIssue[] = [];
  const nouns = productNounTokens(products, customers);
  const toks = tokenize(text, nouns);
  const wordSet = new Set(toks.filter((t): t is { kind: "word"; text: string } => t.kind === "word").map((t) => t.text));

  // ---- customers -----------------------------------------------------------
  const customerMatches = customers.filter((c) => nameTokens(c.name).some((t) => wordSet.has(t)));
  let customerId: string | null = null;
  const customerCandidateIds = customerMatches.map((c) => c.id);
  if (customerMatches.length === 1) customerId = customerMatches[0].id;
  else if (customerMatches.length > 1) issues.push({ id: "ambiguousCustomer" });

  // ---- products ------------------------------------------------------------
  const customerTokens = new Set(customers.flatMap((c) => nameTokens(c.name)));
  const scored = products
    .map((p) => ({ p, score: nameTokens(p.name).filter((t) => wordSet.has(t) && !customerTokens.has(t)).length }))
    .filter((s) => s.score > 0);
  const best = Math.max(0, ...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === best);
  let productId: string | null = null;
  let productCandidateIds: string[] = [];
  let productQuery: string | null = null;
  const matchedProduct = winners.length === 1 ? winners[0].p : null;
  if (matchedProduct) {
    productId = matchedProduct.id;
  } else if (winners.length > 1) {
    productCandidateIds = winners.map((s) => s.p.id);
    issues.push({ id: "ambiguousProduct" });
  }

  // ---- numbers: assign roles ----------------------------------------------
  let quantity: number | null = null;
  let unitPrice: number | null = null; // whole leones
  let statedTotal: number | null = null; // whole leones
  let paidAmount: number | null = null; // whole leones
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
    } else if (prev !== null && SALE_VERBS.has(prev) && isInt && t.value > 0 && t.value <= 9999) {
      if (quantity === null) quantity = t.value;
      else leftovers.push(t.value);
    } else {
      leftovers.push(t.value);
    }
  }

  // One unplaced number with no explicit total → it is the stated total
  // (still shown for confirmation, never silently saved).
  if (statedTotal === null && leftovers.length === 1) statedTotal = leftovers.shift() ?? null;
  if (leftovers.length > 0) issues.push({ id: "unclearNumbers" });

  // ---- payment status ------------------------------------------------------
  const bigrams: string[] = [];
  for (let i = 0; i < toks.length - 1; i += 1) {
    const a = toks[i];
    const b = toks[i + 1];
    if (a.kind === "word" && b.kind === "word") bigrams.push(`${a.text} ${b.text}`);
  }
  const creditStated =
    [...wordSet].some((w) => CREDIT_WORDS.has(w)) ||
    bigrams.some((b) => ["no pay", "nor pay", "not paid", "pay later", "go pay", "never pay", "on credit", "for credit"].includes(b));

  // ---- did we understand anything? ----------------------------------------
  const sawVerb = [...wordSet].some((w) => SALE_VERBS.has(w));
  const sawNumber = toks.some((t) => t.kind === "num");
  const understood = sawVerb || sawNumber || productId !== null || productCandidateIds.length > 0;
  if (!understood) {
    return {
      understood: false,
      productId: null, productCandidateIds: [], productQuery: null,
      quantity: null, unitPriceMinor: null, totalMinor: null,
      payment: "PAID", paidNowMinor: null,
      customerId: null, customerCandidateIds: [],
      issues: [{ id: "notUnderstood" }],
    };
  }

  // ---- unknown product: quantity+unit present but nothing matched ---------
  if (productId === null && productCandidateIds.length === 0) {
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.kind !== "word" || !UNIT_WORDS.has(t.text)) continue;
      for (let j = i + 1; j < Math.min(i + 3, toks.length); j += 1) {
        const cand = toks[j];
        if (cand.kind !== "word") break;
        if (SKIP_WORDS.has(cand.text)) continue;
        if (!nouns.has(cand.text) && !UNIT_WORDS.has(cand.text) && !isNumberWord(cand.text) && !customerTokens.has(cand.text)
            && !EACH_WORDS.has(cand.text) && !AT_WORDS.has(cand.text) && cand.text !== "for" && !PAID_WORDS.has(cand.text) && !CREDIT_WORDS.has(cand.text)) {
          productQuery = cand.text;
          issues.push({ id: "unknownProduct", params: { name: cand.text } });
        }
        break;
      }
      if (productQuery) break;
    }
  }

  // ---- reconcile amounts (deterministic arithmetic on stated numbers) -----
  let totalMinor: number | null = null;
  let unitPriceMinor: number | null = unitPrice !== null ? toMinorUnits(unitPrice) : null;

  if (unitPrice !== null && quantity !== null) {
    const computed = toMinorUnits(unitPrice * quantity);
    const stated = statedTotal !== null ? toMinorUnits(statedTotal) : null;
    if (stated !== null && stated !== computed) {
      issues.push({ id: "conflictTotal", params: { computed: String(unitPrice * quantity), stated: String(statedTotal) } });
      totalMinor = null; // owner must decide — never guess between two stated numbers
    } else {
      totalMinor = computed;
    }
  } else if (unitPrice !== null && quantity === null) {
    issues.push({ id: "missingQuantity" });
    totalMinor = statedTotal !== null ? toMinorUnits(statedTotal) : null;
  } else if (statedTotal !== null) {
    totalMinor = toMinorUnits(statedTotal);
  } else if (paidAmount !== null && !creditStated) {
    totalMinor = toMinorUnits(paidAmount);
  }

  // Product named but no price anywhere in the text → offer the product's OWN
  // configured price (same as tapping its chip), clearly flagged for review.
  if (matchedProduct && totalMinor === null && unitPrice === null && statedTotal === null && paidAmount === null) {
    const qty = quantity ?? 1;
    unitPriceMinor = matchedProduct.selling_price.amount_minor;
    totalMinor = unitPriceMinor * qty;
    issues.push({ id: "usedCatalogPrice" });
  }

  // Product named without a quantity, but the amount is known → default 1 like
  // the manual flow, and say so. (When the amount hinges on the quantity, we ask
  // instead — see missingQuantity above — rather than defaulting.)
  if (matchedProduct && quantity === null && totalMinor !== null) {
    quantity = 1;
    if (!issues.some((x) => x.id === "missingQuantity")) issues.push({ id: "checkQuantity" });
  }

  if (totalMinor === null && !issues.some((x) => x.id === "conflictTotal" || x.id === "missingQuantity")) {
    issues.push({ id: "missingAmount" });
  }
  if (totalMinor !== null && (totalMinor <= 0 || totalMinor > 100_000_000_000)) {
    totalMinor = null;
    issues.push({ id: "missingAmount" });
  }

  // ---- payment resolution --------------------------------------------------
  let payment: "PAID" | "CREDIT" | "PARTIAL" = "PAID";
  let paidNowMinor: number | null = null;
  const paidMinor = paidAmount !== null ? toMinorUnits(paidAmount) : null;
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
  if ((payment === "CREDIT" || payment === "PARTIAL") && customerId === null) {
    issues.push({ id: "needCustomer" });
  }

  return {
    understood: true,
    productId, productCandidateIds, productQuery,
    quantity, unitPriceMinor, totalMinor,
    payment, paidNowMinor,
    customerId, customerCandidateIds,
    issues,
  };
}
