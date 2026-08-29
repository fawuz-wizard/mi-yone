// Interpreter test matrix (feature brief): English, Krio, mixed, missing price,
// missing quantity, ambiguous product, invalid input — plus payment/credit and
// conflict safety cases. The parser must NEVER invent values.
import { describe, expect, it } from "vitest";
import { interpretSale, type InterpretCustomer, type InterpretProduct } from "./interpret";

const products: InterpretProduct[] = [
  { id: "p-101", name: "Rice (50kg bag)", selling_price: { amount_minor: 85_000_00 }, track_inventory: true },
  { id: "p-102", name: "Cooking oil (5L)", selling_price: { amount_minor: 30_000_00 }, track_inventory: true },
  { id: "p-103", name: "Sugar (1kg)", selling_price: { amount_minor: 4_500_00 }, track_inventory: true },
  { id: "p-104", name: "Soap (bar)", selling_price: { amount_minor: 1_500_00 }, track_inventory: true },
];

const customers: InterpretCustomer[] = [
  { id: "c-201", name: "Aminata" },
  { id: "c-202", name: "Foday" },
  { id: "c-203", name: "Isatu" },
];

const ids = (r: ReturnType<typeof interpretSale>) => r.issues.map((i) => i.id);

describe("interpretSale — English", () => {
  it("parses 'Sold 3 bags of rice at Le 350 each'", () => {
    const r = interpretSale("Sold 3 bags of rice at Le 350 each", products, customers);
    expect(r.understood).toBe(true);
    expect(r.productId).toBe("p-101");
    expect(r.quantity).toBe(3);
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
    expect(r.payment).toBe("PAID");
    expect(r.issues).toEqual([]);
  });

  it("parses 'Customer bought 5 bags of rice, paid 1,750'", () => {
    const r = interpretSale("Customer bought 5 bags of rice, paid 1,750", products, customers);
    expect(r.productId).toBe("p-101");
    expect(r.quantity).toBe(5);
    expect(r.totalMinor).toBe(1_750_00);
    expect(r.payment).toBe("PAID");
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
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
  });
});

describe("interpretSale — Krio and mixed", () => {
  it("parses the brief's example: 'Ah sell three bag rice for three hundred and fifty each'", () => {
    const r = interpretSale("Ah sell three bag rice for three hundred and fifty each", products, customers);
    expect(r.productId).toBe("p-101");
    expect(r.quantity).toBe(3);
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
    expect(r.issues).toEqual([]);
  });

  it("parses Krio number words: 'ah sel tri bag rice fo tri ondred en fifti each'", () => {
    const r = interpretSale("ah sel tri bag rice fo tri ondred en fifti each", products, customers);
    expect(r.productId).toBe("p-101");
    expect(r.quantity).toBe(3);
    expect(r.unitPriceMinor).toBe(350_00);
    expect(r.totalMinor).toBe(1_050_00);
  });

  it("resolves Krio 'fo' as the number four before a unit", () => {
    const r = interpretSale("ah sell fo bag rice fo two tousand", products, customers);
    expect(r.quantity).toBe(4);
    expect(r.totalMinor).toBe(2_000_00); // "fo two tousand" → for 2000 (total)
  });

  it("understands Krio credit: 'Isatu tek tu bar soap, i go pay later'", () => {
    const r = interpretSale("Isatu tek tu bar soap, i go pay later", products, customers);
    expect(r.productId).toBe("p-104");
    expect(r.quantity).toBe(2);
    expect(r.payment).toBe("CREDIT");
    expect(r.customerId).toBe("c-203");
    // no price stated → the product's own price is offered, flagged for review
    expect(r.totalMinor).toBe(2 * 1_500_00);
    expect(ids(r)).toContain("usedCatalogPrice");
  });
});

describe("interpretSale — safety: never invent", () => {
  it("missing price with a product → uses the product's own set price and flags it", () => {
    const r = interpretSale("sold 2 bags of rice", products, customers);
    expect(r.quantity).toBe(2);
    expect(r.totalMinor).toBe(2 * 85_000_00);
    expect(ids(r)).toContain("usedCatalogPrice");
  });

  it("missing quantity with a per-unit price → asks instead of defaulting", () => {
    const r = interpretSale("sold rice at 400", products, customers);
    expect(r.productId).toBe("p-101");
    expect(r.unitPriceMinor).toBe(400_00);
    expect(r.totalMinor).toBeNull(); // amount depends on the missing quantity
    expect(ids(r)).toContain("missingQuantity");
  });

  it("ambiguous product → no selection, candidates flagged", () => {
    const withTwoRices: InterpretProduct[] = [
      ...products,
      { id: "p-105", name: "Local rice (25kg)", selling_price: { amount_minor: 40_000_00 }, track_inventory: true },
    ];
    const r = interpretSale("sold 3 bags of rice at 350 each", withTwoRices, customers);
    expect(r.productId).toBeNull();
    expect(r.productCandidateIds.sort()).toEqual(["p-101", "p-105"]);
    expect(ids(r)).toContain("ambiguousProduct");
    expect(r.totalMinor).toBe(1_050_00); // amounts were stated — they still apply
  });

  it("unknown product → flagged, never matched to something else", () => {
    const r = interpretSale("sold 2 cartons of milk for 500 each, cash", products, customers);
    expect(r.productId).toBeNull();
    expect(r.productQuery).toBe("milk");
    expect(ids(r)).toContain("unknownProduct");
    expect(r.quantity).toBe(2);
    expect(r.totalMinor).toBe(1_000_00);
    expect(r.payment).toBe("PAID");
  });

  it("conflicting total vs qty × unit price → no amount, owner decides", () => {
    const r = interpretSale("sold 3 bags of rice at 350 each for 2000 total", products, customers);
    expect(r.totalMinor).toBeNull();
    expect(ids(r)).toContain("conflictTotal");
  });

  it("invalid input → understood=false, nothing applied", () => {
    const r = interpretSale("hello how are you today", products, customers);
    expect(r.understood).toBe(false);
    expect(ids(r)).toEqual(["notUnderstood"]);
    expect(r.totalMinor).toBeNull();
    expect(r.productId).toBeNull();
  });

  it("empty input → understood=false", () => {
    expect(interpretSale("   ", products, customers).understood).toBe(false);
  });
});

describe("interpretSale — payment and customers", () => {
  it("credit sale to a known customer", () => {
    const r = interpretSale("sold 1 bag rice at 85000 to Aminata on credit", products, customers);
    expect(r.payment).toBe("CREDIT");
    expect(r.customerId).toBe("c-201");
    expect(r.totalMinor).toBe(85_000_00);
    expect(r.issues).toEqual([]);
  });

  it("credit without a customer → flagged", () => {
    const r = interpretSale("sold 1 bag rice at 85000 on credit", products, customers);
    expect(r.payment).toBe("CREDIT");
    expect(r.customerId).toBeNull();
    expect(ids(r)).toContain("needCustomer");
  });

  it("partial payment: paid less than the total", () => {
    const r = interpretSale("Foday bought 2 bags of rice at 900 each, paid 1000", products, customers);
    expect(r.totalMinor).toBe(1_800_00);
    expect(r.payment).toBe("PARTIAL");
    expect(r.paidNowMinor).toBe(1_000_00);
    expect(r.customerId).toBe("c-202");
  });

  it("a stray extra number is flagged, not guessed at", () => {
    const r = interpretSale("sold 3 bags rice at 350 each 77 99", products, customers);
    expect(ids(r)).toContain("unclearNumbers");
    expect(r.totalMinor).toBe(1_050_00); // the clearly-stated parts still apply
  });
});
