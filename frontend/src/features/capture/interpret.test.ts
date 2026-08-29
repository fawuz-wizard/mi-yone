// Interpreter test matrix (feature briefs 1+2): English, Krio, mixed, intent
// routing (sale/purchase/expense/receivable/payable), ambiguous-intent asking,
// missing price/quantity, ambiguous/unknown product, invalid input, incorrect
// total, unusual price, insufficient stock, possible duplicate. The parser must
// NEVER invent values and never guess when the meaning is unclear.
import { describe, expect, it } from "vitest";
import {
  hasBlockingIssues,
  interpretEntry,
  interpretSale,
  type InterpretContext,
  type InterpretParty,
  type InterpretProduct,
} from "./interpret";

// Demo-catalogue fixture (matches the seeded business: high SLE prices).
const products: InterpretProduct[] = [
  { id: "p-101", name: "Rice (50kg bag)", selling_price: { amount_minor: 85_000_00 }, track_inventory: true },
  { id: "p-102", name: "Cooking oil (5L)", selling_price: { amount_minor: 30_000_00 }, track_inventory: true },
  { id: "p-103", name: "Sugar (1kg)", selling_price: { amount_minor: 4_500_00 }, track_inventory: true },
  { id: "p-104", name: "Soap (bar)", selling_price: { amount_minor: 1_500_00 }, track_inventory: true },
];

// Small-shop fixture where the brief's toy prices ARE the usual prices —
// lets us assert clean (warning-free) parses and targeted validations.
const toyProducts: InterpretProduct[] = [
  {
    id: "p-1", name: "Rice (bag)", selling_price: { amount_minor: 350_00 },
    cost_price: { amount_minor: 300_00 }, stock: 12, track_inventory: true,
  },
  {
    id: "p-2", name: "Soap (bar)", selling_price: { amount_minor: 15_00 },
    cost_price: { amount_minor: 10_00 }, stock: 60, track_inventory: true,
  },
];

const customers: InterpretParty[] = [
  { id: "c-201", name: "Aminata" },
  { id: "c-202", name: "Foday" },
  { id: "c-203", name: "Isatu" },
];
const suppliers: InterpretParty[] = [{ id: "s-301", name: "Musa Wholesale" }];
const categories = [
  { id: "cat-ex-stock", name: "Stock purchase" },
  { id: "cat-ex-transport", name: "Transport" },
  { id: "cat-ex-rent", name: "Rent" },
];

const ctx: InterpretContext = { products: toyProducts, customers, suppliers, expenseCategories: categories };

const ids = (r: ReturnType<typeof interpretEntry>) => r.issues.map((i) => i.id);
const blocks = (r: ReturnType<typeof interpretEntry>) => r.issues.filter((i) => i.severity === "block").map((i) => i.id);

// ---------------------------------------------------------------------------
// Sales (v1 behavior, preserved)
// ---------------------------------------------------------------------------

describe("sales — English", () => {
  it("parses 'Sold 3 bags of rice at Le 350 each'", () => {
    const r = interpretSale("Sold 3 bags of rice at Le 350 each", products, customers);
    expect(r.understood).toBe(true);
    expect(r.intent).toBe("sale");
    expect(r.productId).toBe("p-101");
    expect(r.quantity).toBe(3);
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
    expect(r.payment).toBe("PAID");
    expect(blocks(r)).toEqual([]);
    // catalogue says Le 85,000/bag — Le 350 is flagged as unusual, not rejected
    expect(ids(r)).toContain("unusualPrice");
  });

  it("parses 'Customer bought 5 bags of rice, paid 1,750' — 'customer bought' is a SALE", () => {
    const r = interpretEntry("Customer bought 5 bags of rice, paid 1,750", ctx);
    expect(r.intent).toBe("sale");
    expect(r.quantity).toBe(5);
    expect(r.totalMinor).toBe(1_750_00);
    expect(r.payment).toBe("PAID");
    expect(blocks(r)).toEqual([]);
  });

  it("clean parse with the business's own usual price has no issues at all", () => {
    const r = interpretEntry("Sold 4 bags of rice at 350 each", ctx);
    expect(r.intent).toBe("sale");
    expect(r.totalMinor).toBe(1_400_00);
    expect(r.issues).toEqual([]);
  });

  it("reads 'for X' without 'each' as the total", () => {
    const r = interpretSale("sold 2 bags of rice for 1500", products, customers);
    expect(r.quantity).toBe(2);
    expect(r.totalMinor).toBe(1_500_00);
    expect(r.unitPriceMinor).toBeNull();
  });

  it("parses spelled-out English numbers", () => {
    const r = interpretSale("sold three bags of rice at three hundred and fifty each", products, customers);
    expect(r.quantity).toBe(3);
    expect(r.totalMinor).toBe(1_050_00);
  });
});

describe("sales — Krio and mixed", () => {
  it("parses 'Ah sell three bag rice for three hundred and fifty each'", () => {
    const r = interpretEntry("Ah sell three bag rice for three hundred and fifty each", ctx);
    expect(r.intent).toBe("sale");
    expect(r.productId).toBe("p-1");
    expect(r.quantity).toBe(3);
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
    expect(r.issues).toEqual([]);
  });

  it("parses Krio number words: 'ah sel tri bag rice fo tri ondred en fifti each'", () => {
    const r = interpretEntry("ah sel tri bag rice fo tri ondred en fifti each", ctx);
    expect(r.quantity).toBe(3);
    expect(r.totalMinor).toBe(1_050_00);
  });

  it("resolves Krio 'fo' as the number four before a unit", () => {
    const r = interpretSale("ah sell fo bag rice fo two tousand", products, customers);
    expect(r.quantity).toBe(4);
    expect(r.totalMinor).toBe(2_000_00);
  });

  it("understands Krio credit: 'Isatu tek tu bar soap, i go pay later'", () => {
    const r = interpretEntry("Isatu tek tu bar soap, i go pay later", ctx);
    expect(r.intent).toBe("sale");
    expect(r.productId).toBe("p-2");
    expect(r.quantity).toBe(2);
    expect(r.payment).toBe("CREDIT");
    expect(r.customerId).toBe("c-203");
    expect(r.totalMinor).toBe(2 * 15_00); // its own set price, flagged
    expect(ids(r)).toContain("usedCatalogPrice");
    expect(blocks(r)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Intent routing: purchases, expenses, credit records
// ---------------------------------------------------------------------------

describe("intent routing", () => {
  it("'Bought 20 bags of rice for 300 each' → PURCHASE at the usual cost, no issues", () => {
    const r = interpretEntry("Bought 20 bags of rice for 300 each", ctx);
    expect(r.intent).toBe("purchase");
    expect(r.productId).toBe("p-1");
    expect(r.quantity).toBe(20);
    expect(r.unitPriceMinor).toBe(300_00);
    expect(r.totalMinor).toBe(6_000_00);
    expect(r.paidSupplier).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("purchase on credit from a known supplier", () => {
    const r = interpretEntry("bought 20 bags rice at 300 each from Musa on credit", ctx);
    expect(r.intent).toBe("purchase");
    expect(r.paidSupplier).toBe(false);
    expect(r.supplierId).toBe("s-301");
    expect(blocks(r)).toEqual([]);
  });

  it("purchase of an unknown product is BLOCKED — stock can't come in against nothing", () => {
    const r = interpretEntry("bought 5 bags of cement at 200 each", ctx);
    expect(r.intent).toBe("purchase");
    expect(blocks(r)).toContain("productRequired");
  });

  it("purchase with no stated cost falls back to the recorded cost price, flagged", () => {
    const r = interpretEntry("bought 10 bags of rice", ctx);
    expect(r.intent).toBe("purchase");
    expect(r.unitPriceMinor).toBe(300_00);
    expect(r.totalMinor).toBe(3_000_00);
    expect(ids(r)).toContain("usedCatalogCost");
    expect(blocks(r)).toEqual([]);
  });

  it("'Paid 100,000 for transport' → EXPENSE with the matching category", () => {
    const r = interpretEntry("Paid 100,000 for transport", ctx);
    expect(r.intent).toBe("expense");
    expect(r.totalMinor).toBe(100_000_00);
    expect(r.categoryId).toBe("cat-ex-transport");
    expect(r.noteText).toBeNull(); // the tail IS the category — no duplicate note
    expect(r.issues).toEqual([]);
  });

  it("expense keeps a free-text description when it isn't a category", () => {
    const r = interpretEntry("paid 5000 for generator repair", ctx);
    expect(r.intent).toBe("expense");
    expect(r.totalMinor).toBe(5_000_00);
    expect(r.categoryId).toBeNull();
    expect(r.noteText).toBe("generator repair");
  });

  it("'Aminata owes me 50,000' → RECEIVABLE credit record", () => {
    const r = interpretEntry("Aminata owes me 50,000", ctx);
    expect(r.intent).toBe("receivable");
    expect(r.customerId).toBe("c-201");
    expect(r.totalMinor).toBe(50_000_00);
    expect(r.issues).toEqual([]);
  });

  it("'Customer owes me 50,000' without a name asks who", () => {
    const r = interpretEntry("Customer owes me 50,000", ctx);
    expect(r.intent).toBe("receivable");
    expect(r.customerId).toBeNull();
    expect(blocks(r)).toContain("needCustomer");
  });

  it("'I owe Musa 30,000' → PAYABLE to the supplier", () => {
    const r = interpretEntry("I owe Musa 30,000", ctx);
    expect(r.intent).toBe("payable");
    expect(r.supplierId).toBe("s-301");
    expect(r.totalMinor).toBe(30_000_00);
    expect(blocks(r)).toEqual([]);
  });

  it("'Rice 350' is AMBIGUOUS — ask sale or purchase, never guess", () => {
    const r = interpretEntry("Rice 350", ctx);
    expect(r.understood).toBe(true);
    expect(r.intent).toBeNull();
    expect(blocks(r)).toContain("ambiguousIntent");
    expect(r.totalMinor).toBeNull(); // nothing pre-committed while unresolved
  });

  it("answering the question resolves it (forced intent)", () => {
    const r = interpretEntry("Rice 350", ctx, "sale");
    expect(r.intent).toBe("sale");
    expect(r.totalMinor).toBe(350_00);
    expect(ids(r)).toContain("checkQuantity");
  });

  it("a forced intent never makes gibberish understood", () => {
    const r = interpretEntry("hello how are you", ctx, "sale");
    expect(r.understood).toBe(false);
    expect(ids(r)).toEqual(["notUnderstood"]);
  });
});

// ---------------------------------------------------------------------------
// Validation: incomplete / suspicious records
// ---------------------------------------------------------------------------

describe("validation — never invent, never silently accept", () => {
  it("missing quantity with a per-unit price → asks instead of defaulting", () => {
    const r = interpretEntry("sold rice at 400", ctx);
    expect(r.unitPriceMinor).toBe(400_00);
    expect(r.totalMinor).toBeNull();
    expect(blocks(r)).toContain("missingQuantity");
  });

  it("missing price with a product → uses the product's own set price and flags it", () => {
    const r = interpretEntry("sold 2 bags of rice", ctx);
    expect(r.totalMinor).toBe(2 * 350_00);
    expect(ids(r)).toContain("usedCatalogPrice");
    expect(blocks(r)).toEqual([]);
  });

  it("incorrect total (brief's example): 10 × 350 stated as 2,000 → BLOCK, expected total surfaced", () => {
    const r = interpretEntry("Sold 10 bags of rice at Le 350 each. Total Le 2,000.", ctx);
    expect(blocks(r)).toContain("conflictTotal");
    expect(r.totalMinor).toBeNull();
    const issue = r.issues.find((i) => i.id === "conflictTotal");
    expect(issue?.params).toEqual({ computed: "3500", stated: "2000" });
  });

  it("unusual price (brief's example): usual 350, entered 700 → WARN with both numbers, amount kept", () => {
    const r = interpretEntry("sold 4 bags of rice at 700 each", ctx);
    const issue = r.issues.find((i) => i.id === "unusualPrice");
    expect(issue?.severity).toBe("warn");
    expect(issue?.params).toEqual({ product: "Rice (bag)", usual: "350", entered: "700" });
    expect(r.totalMinor).toBe(2_800_00); // confirm-anyway allowed — never auto-rejected
  });

  it("quantity above available stock → WARN with what's left, not a rejection", () => {
    const r = interpretEntry("sold 20 bags of rice at 350 each", ctx);
    const issue = r.issues.find((i) => i.id === "insufficientStock");
    expect(issue?.severity).toBe("warn");
    expect(issue?.params).toEqual({ have: "12" });
    expect(r.totalMinor).toBe(7_000_00);
  });

  it("same amount recorded minutes ago → possible duplicate WARN", () => {
    const now = new Date("2026-08-29T12:00:00Z");
    const recent = [{ type: "INCOME" as const, amount_minor: 1_400_00, occurred_at: "2026-08-29T11:57:00Z" }];
    const r = interpretEntry("sold 4 bags of rice at 350 each", { ...ctx, recentTransactions: recent, now });
    expect(ids(r)).toContain("possibleDuplicate");
    expect(blocks(r)).toEqual([]);
  });

  it("the duplicate window is narrow — half an hour later it is silent", () => {
    const now = new Date("2026-08-29T12:00:00Z");
    const recent = [{ type: "INCOME" as const, amount_minor: 1_400_00, occurred_at: "2026-08-29T11:28:00Z" }];
    const r = interpretEntry("sold 4 bags of rice at 350 each", { ...ctx, recentTransactions: recent, now });
    expect(ids(r)).not.toContain("possibleDuplicate");
  });

  it("ambiguous product on a sale → no selection, candidates flagged, stated amounts kept", () => {
    const withTwoRices: InterpretProduct[] = [
      ...products,
      { id: "p-105", name: "Local rice (25kg)", selling_price: { amount_minor: 40_000_00 }, track_inventory: true },
    ];
    const r = interpretSale("sold 3 bags of rice at 350 each", withTwoRices, customers);
    expect(r.productId).toBeNull();
    expect(r.productCandidateIds.sort()).toEqual(["p-101", "p-105"]);
    expect(ids(r)).toContain("ambiguousProduct");
    expect(r.totalMinor).toBe(1_050_00);
  });

  it("unknown product on a sale → flagged, never matched to something else", () => {
    const r = interpretSale("sold 2 cartons of milk for 500 each, cash", products, customers);
    expect(r.productId).toBeNull();
    expect(r.productQuery).toBe("milk");
    expect(ids(r)).toContain("unknownProduct");
    expect(r.totalMinor).toBe(1_000_00);
  });

  it("invalid input → understood=false, nothing applied", () => {
    const r = interpretEntry("hello how are you today", ctx);
    expect(r.understood).toBe(false);
    expect(ids(r)).toEqual(["notUnderstood"]);
  });

  it("empty input → understood=false", () => {
    expect(interpretEntry("   ", ctx).understood).toBe(false);
  });

  it("credit sale without a customer → blocked until one is picked", () => {
    const r = interpretEntry("sold 1 bag rice at 350 on credit", ctx);
    expect(r.payment).toBe("CREDIT");
    expect(blocks(r)).toContain("needCustomer");
    expect(hasBlockingIssues(r)).toBe(true);
  });

  it("partial payment: paid less than the total", () => {
    const r = interpretEntry("Foday bought 2 bags of rice at 350 each, paid 400", ctx);
    expect(r.intent).toBe("sale");
    expect(r.totalMinor).toBe(700_00);
    expect(r.payment).toBe("PARTIAL");
    expect(r.paidNowMinor).toBe(400_00);
    expect(r.customerId).toBe("c-202");
  });

  it("a stray extra number is flagged, not guessed at", () => {
    const r = interpretEntry("sold 3 bags rice at 350 each 77 99", ctx);
    expect(ids(r)).toContain("unclearNumbers");
    expect(r.totalMinor).toBe(1_050_00);
  });
});
