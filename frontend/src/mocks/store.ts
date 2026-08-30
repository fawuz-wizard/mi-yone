// ============================================================
// MOCK API STORE — NOT A REAL BACKEND.
// ============================================================
// This in-memory store implements the Phase 2 (Rev 2) API contract shapes so the
// frontend can be built and tested before the FastAPI backend exists:
//   - envelope responses           - integer minor units + server-side formatting
//   - idempotency-key dedupe       - reversal-based corrections with history
// It is clearly labeled MOCK (Phase 2 §20: never pretend a mock is real).
// Replacing it = pointing the client at the real /api/v1. No client changes.
// State resets on server restart by design — this is demo infrastructure.
// ============================================================
import type {
  ApiErrorBody,
  AttentionItem,
  Business,
  DashboardResponse,
  Insight,
  Money,
  Transaction,
} from "@/shared/api/types";

export const MOCK_USER = "Mariama";

export const business: Business = {
  id: "b-demo-1",
  name: "Mariama's Provisions",
  currency: "SLE",
  initial: "M",
};

// --- Server-side money formatting (SLE, exponent 2; Phase 2 §7.1) ---
export function formatMoney(amountMinor: number): Money {
  const whole = Math.trunc(amountMinor / 100);
  const cents = Math.abs(amountMinor % 100);
  const grouped = Math.abs(whole).toLocaleString("en-US");
  const sign = amountMinor < 0 ? "−" : "";
  const display = cents === 0 ? `Le ${sign}${grouped}` : `Le ${sign}${grouped}.${String(cents).padStart(2, "0")}`;
  return { amount_minor: amountMinor, currency: "SLE", display };
}

let seq = 100;
function id(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

// Deterministic historical seed (demo business, ~12 months) so time-range analytics
// have real ledger rows to compute from. Pattern-based, no randomness (resume-safe).
function wholeLe(minor: number): number {
  return Math.round(minor / 100) * 100; // shops deal in whole leones
}

function seedHistory(): Transaction[] {
  const rows: Transaction[] = [];
  // Older history: weekly sales with gentle growth + stock/transport/rent.
  for (let week = 52; week >= 5; week -= 1) {
    const growth = 1 + (52 - week) * 0.012; // ~+60% across the year
    const wobble = week % 4 === 0 ? 0.82 : week % 3 === 0 ? 1.12 : 1.0;
    const salesMinor = wholeLe(9_000_000 * growth * wobble); // ≈ Le 90,000/wk base
    rows.push(mk("INCOME", salesMinor, "Sales", daysAgo(week * 7, 11), "SALE"));
    if (week % 2 === 0) {
      rows.push(mk("EXPENSE", wholeLe(salesMinor * 0.42), "Stock purchase", daysAgo(week * 7 - 1, 8), "MANUAL"));
    }
    if (week % 4 === 1) {
      rows.push(mk("EXPENSE", 1_800_000, "Transport", daysAgo(week * 7 - 2, 7), "MANUAL"));
    }
  }
  // Recent month: daily sales (what a real shop's ledger looks like at 30d/7d zoom).
  for (let day = 34; day >= 1; day -= 1) {
    const wobble = day % 7 === 0 ? 0.6 : day % 5 === 0 ? 1.35 : day % 3 === 0 ? 1.1 : 0.9;
    rows.push(mk("INCOME", wholeLe(1_600_000 * wobble), "Sales", daysAgo(day, 10 + (day % 6)), "SALE"));
    if (day % 4 === 0) {
      rows.push(mk("EXPENSE", wholeLe(2_400_000 * (day % 8 === 0 ? 1.5 : 1)), "Stock purchase", daysAgo(day, 8), "MANUAL"));
    }
    if (day % 9 === 0) {
      rows.push(mk("EXPENSE", 900_000, "Transport", daysAgo(day, 7), "MANUAL"));
    }
  }
  for (let month = 12; month >= 1; month -= 1) {
    rows.push(mk("EXPENSE", 5_000_000, "Rent", daysAgo(month * 30, 9), "MANUAL"));
  }
  return rows;
}

export const transactions: Transaction[] = [
  ...seedHistory(),
  mk("INCOME", 4500000, "Sales", daysAgo(0, 9), "SALE"),
  mk("INCOME", 12000000, "Sales", daysAgo(1, 12), "SALE"),
  mk("EXPENSE", 3500000, "Stock purchase", daysAgo(1, 8), "MANUAL", "Rice, 2 bags"),
  mk("INCOME", 8000000, "Sales", daysAgo(3, 15), "SALE"),
  mk("EXPENSE", 1500000, "Transport", daysAgo(4, 7), "MANUAL"),
  mk("INCOME", 6500000, "Sales", daysAgo(6, 11), "SALE"),
  mk("EXPENSE", 2000000, "Transport", daysAgo(12, 9), "MANUAL"),
  mk("INCOME", 15000000, "Sales", daysAgo(14, 13), "SALE"),
];

function mk(
  type: Transaction["type"],
  amountMinor: number,
  category: string,
  occurredAt: string,
  source: Transaction["source"],
  description: string | null = null,
): Transaction {
  return {
    id: id("t"),
    business_id: business.id,
    type,
    status: "POSTED",
    amount: formatMoney(amountMinor),
    category_name: category,
    description,
    occurred_at: occurredAt,
    created_at: occurredAt,
    recorded_by: MOCK_USER,
    source,
    counterparty_id: null,
    reverses_transaction_id: null,
    fixed: null,
  };
}

// --- Categories (seeded defaults, Phase 2 M3) ---
import type { Category } from "@/shared/api/types";

export const categories: Category[] = [
  { id: "cat-in-sales", name: "Sales", kind: "INCOME" },
  { id: "cat-in-other", name: "Other income", kind: "INCOME" },
  { id: "cat-ex-stock", name: "Stock purchase", kind: "EXPENSE" },
  { id: "cat-ex-transport", name: "Transport", kind: "EXPENSE" },
  { id: "cat-ex-rent", name: "Rent", kind: "EXPENSE" },
  { id: "cat-ex-utilities", name: "Utilities", kind: "EXPENSE" },
  { id: "cat-ex-wages", name: "Wages", kind: "EXPENSE" },
  { id: "cat-ex-general", name: "General expense", kind: "EXPENSE" },
];

export function categoryName(categoryId: string | undefined, kind: "INCOME" | "EXPENSE"): string {
  const found = categoryId ? categories.find((c) => c.id === categoryId && c.kind === kind) : undefined;
  return found?.name ?? (kind === "INCOME" ? "Sales" : "General expense");
}

// --- Idempotency (Phase 2 §21): key → transaction id, replay returns the original ---
const idempotency = new Map<string, string>();

export function createTransaction(
  input: {
    type: Transaction["type"];
    amount_minor: number;
    category_id?: string;
    description?: string;
    occurred_at?: string;
    counterparty_id?: string;
    source: Transaction["source"];
  },
  idempotencyKey: string | null,
): { transaction: Transaction; replay: boolean } {
  if (idempotencyKey && idempotency.has(idempotencyKey)) {
    const existing = transactions.find((t) => t.id === idempotency.get(idempotencyKey));
    if (existing) return { transaction: existing, replay: true };
  }
  const now = new Date().toISOString();
  // occurred_at may be backdated (never future); created_at never lies.
  let occurredAt = now;
  if (input.occurred_at) {
    const parsed = new Date(input.occurred_at);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) occurredAt = parsed.toISOString();
  }
  const t: Transaction = {
    id: id("t"),
    business_id: business.id,
    type: input.type,
    status: "POSTED",
    amount: formatMoney(input.amount_minor),
    category_name: categoryName(input.category_id, input.type),
    description: input.description ?? null,
    occurred_at: occurredAt,
    created_at: now,
    recorded_by: MOCK_USER,
    source: input.source,
    counterparty_id: input.counterparty_id ?? null,
    reverses_transaction_id: null,
    fixed: null,
  };
  transactions.unshift(t);
  if (idempotencyKey) idempotency.set(idempotencyKey, t.id);
  return { transaction: t, replay: false };
}

// --- Correction = reversal + corrected record, atomically (Phase 2 §8).
// Any financial field may be corrected: amount, category, note, business date. ---
export function fixTransaction(
  txId: string,
  changes: { amount_minor?: number; category_id?: string; description?: string; occurred_at?: string },
): Transaction | null {
  const original = transactions.find((t) => t.id === txId && t.status === "POSTED");
  if (!original) return null;
  const newAmountMinor = changes.amount_minor ?? original.amount.amount_minor;
  let occurredAt = original.occurred_at;
  if (changes.occurred_at) {
    const parsed = new Date(changes.occurred_at);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) occurredAt = parsed.toISOString();
  }
  original.status = "REVERSED";
  const now = new Date().toISOString();
  const reversal: Transaction = {
    ...original,
    id: id("t"),
    status: "POSTED",
    occurred_at: now,
    created_at: now,
    reverses_transaction_id: original.id,
    fixed: null,
  };
  const corrected: Transaction = {
    ...original,
    id: id("t"),
    status: "POSTED",
    amount: formatMoney(newAmountMinor),
    category_name: changes.category_id ? categoryName(changes.category_id, original.type) : original.category_name,
    description: changes.description !== undefined ? changes.description || null : original.description,
    occurred_at: occurredAt,
    created_at: now,
    reverses_transaction_id: null,
    fixed: { by: MOCK_USER, was: original.amount, now: formatMoney(newAmountMinor) },
  };
  // The reversal row exists for audit; it is excluded from lists/sums (Phase 2 §9 semantics).
  transactions.push(reversal);
  transactions.unshift(corrected);
  return corrected;
}

export function reverseTransaction(txId: string): boolean {
  const original = transactions.find((t) => t.id === txId && t.status === "POSTED");
  if (!original) return false;
  original.status = "REVERSED";
  const now = new Date().toISOString();
  transactions.push({
    ...original,
    id: id("t"),
    status: "POSTED",
    occurred_at: now,
    created_at: now,
    reverses_transaction_id: original.id,
  });
  return true;
}

// Visible ledger rows: POSTED, non-reversal rows (reversal rows are audit-only).
export function visibleTransactions(): Transaction[] {
  return transactions.filter((t) => t.status === "POSTED" && t.reverses_transaction_id === null);
}

function periodStart(period: "today" | "week" | "month"): Date {
  const d = new Date();
  if (period === "today") d.setHours(0, 0, 0, 0);
  if (period === "week") {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
  }
  if (period === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export function dashboard(period: "today" | "week" | "month"): DashboardResponse {
  const start = periodStart(period).getTime();
  const rows = visibleTransactions().filter((t) => new Date(t.occurred_at).getTime() >= start);
  const sum = (type: Transaction["type"]) =>
    rows.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount.amount_minor, 0);
  const moneyIn = sum("INCOME");
  const moneyOut = sum("EXPENSE");

  // Previous equal-length window for the comparison line (server-phrased).
  const now = Date.now();
  const len = now - start;
  const prevRows = visibleTransactions().filter((t) => {
    const ts = new Date(t.occurred_at).getTime();
    return ts >= start - len && ts < start;
  });
  const prevLeft =
    prevRows.filter((t) => t.type === "INCOME").reduce((a, t) => a + t.amount.amount_minor, 0) -
    prevRows.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + t.amount.amount_minor, 0);
  const left = moneyIn - moneyOut;
  const diff = left - prevLeft;
  const comparison =
    prevRows.length === 0
      ? null
      : diff >= 0
        ? `${formatMoney(Math.abs(diff)).display} more than last ${period === "today" ? "day" : period} ↑`
        : `${formatMoney(Math.abs(diff)).display} less than last ${period === "today" ? "day" : period} ↓`;

  // 7-bucket trend of daily left-over across the window (relative values for the sparkline).
  const trend: number[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 86400000;
    const day = visibleTransactions().filter((t) => {
      const ts = new Date(t.occurred_at).getTime();
      return ts >= dayStart.getTime() && ts < dayEnd;
    });
    trend.push(
      day.reduce((a, t) => a + (t.type === "INCOME" ? t.amount.amount_minor : -t.amount.amount_minor), 0) / 100,
    );
  }

  // Deterministic insight: largest expense category this month (analytics computes, AI phrases — Phase 2 §13).
  const monthStart = periodStart("month").getTime();
  const monthExpenses = visibleTransactions().filter(
    (t) => t.type === "EXPENSE" && new Date(t.occurred_at).getTime() >= monthStart,
  );
  const byCategory = new Map<string, number>();
  monthExpenses.forEach((t) =>
    byCategory.set(t.category_name, (byCategory.get(t.category_name) ?? 0) + t.amount.amount_minor),
  );
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const insight: Insight | null = top
    ? {
        id: "ins-top-expense",
        statement: `${top[0]} is your biggest cost this month.`,
        figure: formatMoney(top[1]).display,
        context: "this month so far",
        action_label: "See these expenses",
        action_target: "/money?tab=out",
      }
    : null;

  const attention: AttentionItem[] = attentionItems();

  // M17 parity — spending summary for the SELECTED period (top 3 categories).
  const periodByCat = new Map<string, number>();
  rows
    .filter((t) => t.type === "EXPENSE")
    .forEach((t) => periodByCat.set(t.category_name, (periodByCat.get(t.category_name) ?? 0) + t.amount.amount_minor));
  const rankedCats = [...periodByCat.entries()].sort((a, b) => b[1] - a[1]);
  const spending =
    rankedCats.length > 0
      ? {
          total: formatMoney(moneyOut),
          top: rankedCats.slice(0, 3).map(([name, v]) => ({ name, total: formatMoney(v) })),
        }
      : null;

  // M17 parity — profit + margin from the SAME report() logic (never disagree
  // with Reports; margin absent on a zero-revenue base).
  const rep = report(period);
  const bookedRev = rep.profit.booked_revenue.amount_minor;
  const profitMinor = rep.profit.profit.amount_minor;
  const profit =
    moneyIn > 0 || moneyOut > 0 || bookedRev > 0
      ? {
          estimated: rep.profit.profit,
          margin_pct: bookedRev > 0 ? ((profitMinor / bookedRev) * 100).toFixed(0) : null,
        }
      : null;

  // M17 parity — Partner overview line upgrades the insight slot when history
  // allows; otherwise the deterministic top-expense insight stands.
  let finalInsight = insight;
  const tr = computeTrends("30d");
  const lo = tr.metrics.find((m) => m.key === "left_over");
  if (lo && lo.direction !== null) {
    const word = lo.direction === "up" ? "improved" : lo.direction === "down" ? "declined" : "held steady";
    const pct = lo.change_pct !== null ? ` (${lo.change_pct}%)` : "";
    finalInsight = {
      id: "ins-partner-overview",
      statement: `What you kept ${word}${pct} over the last 30 days.`,
      figure: lo.current,
      context: tr.contributors.length > 0 ? tr.contributors[0].text : "Compared with the 30 days before.",
      action_label: "Ask the Partner",
      action_target: "/partner",
    };
  }

  return {
    business,
    spending,
    profit,
    health: {
      period,
      money_in: formatMoney(moneyIn),
      money_out: formatMoney(moneyOut),
      left_over: formatMoney(left),
      comparison,
      trend,
      pending_count: 0, // pending records live client-side; the server never counts them (Phase 5 §26)
    },
    attention,
    insight: finalInsight,
  };
}

// ============================================================
// MOCK: products, customers, suppliers, receivables, payables, sales
// ============================================================
import type { Customer, Debt, Supplier, CreateSaleInput, SaleResult, SettlementResult } from "@/shared/api/types";

// Products: raw rows + an APPEND-ONLY movement ledger. Stock is never a naked
// editable number — it is the sum of movement deltas (Phase 2 §10).
import type {
  AddStockInput,
  MovementType,
  Product,
  StockCheckInput,
  StockMovement,
  UpdateProductInput,
} from "@/shared/api/types";

interface ProductRow {
  id: string;
  name: string;
  unit: string;
  selling_minor: number;
  cost_minor: number;
  threshold: number;
  track: boolean;
  archived: boolean;
  description?: string | null;
  sku?: string | null;
  category?: string | null;
}

// MOCK image store: product photos held in memory (base64), served by the
// mock image route. Real backend: validated file storage on disk.
const productImages = new Map<string, { b64: string; type: string }>();
export function setProductImage(productId: string, b64: string, type: string): void {
  productImages.set(productId, { b64, type });
}
export function getProductImage(productId: string): { b64: string; type: string } | null {
  return productImages.get(productId) ?? null;
}
export function removeProductImage(productId: string): void {
  productImages.delete(productId);
}

const productRows: ProductRow[] = [
  { id: "p-101", name: "Rice (50kg bag)", unit: "bag", selling_minor: 85_000_00, cost_minor: 70_000_00, threshold: 5, track: true, archived: false },
  { id: "p-102", name: "Cooking oil (5L)", unit: "piece", selling_minor: 30_000_00, cost_minor: 24_000_00, threshold: 5, track: true, archived: false },
  { id: "p-103", name: "Sugar (1kg)", unit: "kg", selling_minor: 4_500_00, cost_minor: 3_600_00, threshold: 10, track: true, archived: false },
  { id: "p-104", name: "Soap (bar)", unit: "piece", selling_minor: 1_500_00, cost_minor: 1_000_00, threshold: 12, track: true, archived: false },
];

const movements: StockMovement[] = [];

function addMovement(
  productId: string,
  type: MovementType,
  quantityDelta: number,
  unitCostMinor: number | null,
  note: string | null = null,
  occurredAt: string = new Date().toISOString(),
): StockMovement {
  const m: StockMovement = {
    id: id("mv"),
    product_id: productId,
    type,
    quantity_delta: quantityDelta,
    unit_cost: unitCostMinor === null ? null : formatMoney(unitCostMinor),
    occurred_at: occurredAt,
    recorded_by: MOCK_USER,
    note,
  };
  movements.push(m);
  return m;
}

// Seed opening stock as PURCHASE movements (the ledger is the source of truth).
addMovement("p-101", "PURCHASE", 12, 70_000_00, null, daysAgo(20, 8));
addMovement("p-102", "PURCHASE", 5, 24_000_00, null, daysAgo(15, 8));
addMovement("p-102", "SALE", -2, null, null, daysAgo(3, 12));
addMovement("p-103", "PURCHASE", 40, 3_600_00, null, daysAgo(10, 8));
addMovement("p-104", "PURCHASE", 60, 1_000_00, null, daysAgo(25, 8));
addMovement("p-104", "SALE", -2, null, null, daysAgo(2, 15));

export function stockOf(productId: string): number {
  return movements.filter((m) => m.product_id === productId).reduce((a, m) => a + m.quantity_delta, 0);
}

export function toProduct(row: ProductRow): Product {
  const stock = row.track ? stockOf(row.id) : 0;
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    selling_price: formatMoney(row.selling_minor),
    cost_price: formatMoney(row.cost_minor),
    stock,
    low_stock_threshold: row.threshold,
    low_stock: row.track && stock <= row.threshold,
    stock_value: formatMoney(Math.max(0, stock) * row.cost_minor), // estimated (latest cost, Phase 2 §7.1)
    track_inventory: row.track,
    archived: row.archived,
    description: row.description ?? null,
    sku: row.sku ?? null,
    category: row.category ?? null,
    has_image: productImages.has(row.id),
    image_url: productImages.has(row.id) ? `/api/v1/businesses/b-demo-1/products/${row.id}/image` : null,
  };
}

export function listProducts(includeArchived = false): Product[] {
  return productRows
    .filter((r) => includeArchived || !r.archived)
    .map(toProduct)
    .sort((a, b) => Number(b.low_stock) - Number(a.low_stock) || a.name.localeCompare(b.name));
}

export function getProductRow(idOrNull: string | undefined | null): ProductRow | undefined {
  return productRows.find((r) => r.id === idOrNull);
}

export function productMovements(productId: string): StockMovement[] {
  return movements.filter((m) => m.product_id === productId).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function createProduct(input: {
  name: string;
  unit?: string;
  selling_price_minor: number;
  cost_price_minor?: number;
  low_stock_threshold?: number;
  initial_stock?: number;
  description?: string;
  sku?: string;
  category?: string;
}): Product {
  const row: ProductRow = {
    id: id("p"),
    name: input.name.trim(),
    unit: input.unit?.trim() || "piece",
    selling_minor: input.selling_price_minor,
    cost_minor: input.cost_price_minor ?? 0,
    threshold: input.low_stock_threshold ?? 5,
    track: true,
    archived: false,
    description: input.description?.trim() || null,
    sku: input.sku?.trim() || null,
    category: input.category?.trim() || null,
  };
  productRows.push(row);
  if (input.initial_stock && input.initial_stock > 0) {
    addMovement(row.id, "PURCHASE", input.initial_stock, row.cost_minor || null, "Opening stock");
  }
  return toProduct(row);
}

export function updateProduct(productId: string, input: UpdateProductInput): Product | null {
  const row = productRows.find((r) => r.id === productId);
  if (!row) return null;
  if (input.name !== undefined) row.name = input.name.trim() || row.name;
  if (input.unit !== undefined) row.unit = input.unit.trim() || row.unit;
  if (input.selling_price_minor !== undefined) row.selling_minor = input.selling_price_minor;
  if (input.cost_price_minor !== undefined) row.cost_minor = input.cost_price_minor;
  if (input.low_stock_threshold !== undefined) row.threshold = input.low_stock_threshold;
  if (input.archived !== undefined) row.archived = input.archived;
  return toProduct(row);
}

// Add stock = one action: PURCHASE movement + EXPENSE transaction + optional payable.
export function addStock(productId: string, input: AddStockInput): { product: Product; movement: StockMovement } | null {
  const row = productRows.find((r) => r.id === productId && !r.archived);
  if (!row || input.quantity <= 0 || input.unit_cost_minor < 0) return null;
  if (!input.paid && !input.supplier_id) return null;
  row.cost_minor = input.unit_cost_minor || row.cost_minor; // latest-cost model
  const movement = addMovement(productId, "PURCHASE", input.quantity, input.unit_cost_minor);
  const totalMinor = input.quantity * input.unit_cost_minor;
  if (totalMinor > 0) {
    if (input.paid) {
      createTransaction(
        { type: "EXPENSE", amount_minor: totalMinor, category_id: "cat-ex-stock", description: `${row.name} × ${input.quantity}`, source: "MANUAL" },
        null,
      );
    } else {
      const supplier = suppliers.find((s) => s.id === input.supplier_id);
      debts.push({
        id: id("pay"),
        kind: "payable",
        counterparty_id: input.supplier_id!,
        counterparty_name: supplier?.name ?? "Supplier",
        amount_minor: totalMinor,
        settled_minor: 0,
        since: new Date().toISOString(),
        due_date: null,
        source: "PURCHASE",
      });
    }
  }
  return { product: toProduct(row), movement };
}

// Stock check: the owner states reality; the server computes the delta.
export function stockCheck(productId: string, input: StockCheckInput): { product: Product; movement: StockMovement | null } | null {
  const row = productRows.find((r) => r.id === productId && !r.archived);
  if (!row || input.counted < 0) return null;
  const delta = input.counted - stockOf(productId);
  if (delta === 0) return { product: toProduct(row), movement: null };
  const type: MovementType = input.reason === "DAMAGED" ? "DAMAGE" : "ADJUSTMENT";
  const note = input.note ?? (input.reason === "DAMAGED" ? "damaged" : input.reason === "COUNTED" ? "counted" : "other");
  const movement = addMovement(productId, type, delta, null, note);
  return { product: toProduct(row), movement };
}

interface PartyRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  archived: boolean;
}

export const customerRows: PartyRow[] = [
  { id: "c-201", name: "Aminata", phone: "+232 76 000001", notes: null, archived: false },
  { id: "c-202", name: "Foday", phone: "+232 76 000002", notes: null, archived: false },
  { id: "c-203", name: "Isatu", phone: null, notes: null, archived: false },
];

export const supplierRows: PartyRow[] = [
  { id: "s-301", name: "Musa Wholesale", phone: "+232 76 000009", notes: null, archived: false },
];

export function outstandingFor(counterpartyId: string): number {
  return debts
    .filter((d) => d.counterparty_id === counterpartyId)
    .reduce((a, d) => a + (d.amount_minor - d.settled_minor), 0);
}

function toParty(row: PartyRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    archived: row.archived,
    outstanding: formatMoney(outstandingFor(row.id)),
  };
}

export function listParties(kind: "customer" | "supplier", includeArchived = false): Customer[] {
  const rows = kind === "customer" ? customerRows : supplierRows;
  return rows
    .filter((r) => includeArchived || !r.archived)
    .map(toParty)
    .sort((a, b) => b.outstanding.amount_minor - a.outstanding.amount_minor || a.name.localeCompare(b.name));
}

export function updateParty(
  kind: "customer" | "supplier",
  partyId: string,
  input: { name?: string; phone?: string; notes?: string; archived?: boolean },
): Customer | null {
  const rows = kind === "customer" ? customerRows : supplierRows;
  const row = rows.find((r) => r.id === partyId);
  if (!row) return null;
  if (input.name !== undefined) row.name = input.name.trim() || row.name;
  if (input.phone !== undefined) row.phone = input.phone.trim() || null;
  if (input.notes !== undefined) row.notes = input.notes.trim() || null;
  if (input.archived !== undefined) row.archived = input.archived;
  return toParty(row);
}

export function partyDetail(kind: "customer" | "supplier", partyId: string) {
  const rows = kind === "customer" ? customerRows : supplierRows;
  const row = rows.find((r) => r.id === partyId);
  if (!row) return null;
  const openDebts = debts
    .filter((d) => d.counterparty_id === partyId && d.amount_minor - d.settled_minor > 0)
    .map(toDebt);
  const history = visibleTransactions()
    .filter((t) => t.counterparty_id === partyId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 30);
  return { party: toParty(row), open_debts: openDebts, history };
}

export function addManualDebt(
  kind: "receivable" | "payable",
  input: { counterparty_id: string; amount_minor: number },
): Debt | null {
  const rows = kind === "receivable" ? customerRows : supplierRows;
  const row = rows.find((r) => r.id === input.counterparty_id);
  if (!row || input.amount_minor <= 0) return null;
  const debtRow: DebtRow = {
    id: id(kind === "receivable" ? "r" : "pay"),
    kind,
    counterparty_id: row.id,
    counterparty_name: row.name,
    amount_minor: input.amount_minor,
    settled_minor: 0,
    since: new Date().toISOString(),
    due_date: null,
    source: "MANUAL",
  };
  debts.push(debtRow);
  return toDebt(debtRow);
}

// Back-compat views used by sale/stock orchestration:
export const customers = { find: (fn: (c: PartyRow) => boolean) => customerRows.find(fn) };
export const suppliers = { find: (fn: (s: PartyRow) => boolean) => supplierRows.find(fn) };

interface DebtRow {
  id: string;
  kind: "receivable" | "payable";
  counterparty_id: string;
  counterparty_name: string;
  amount_minor: number;
  settled_minor: number;
  since: string;
  due_date: string | null;
  source: "SALE" | "MANUAL" | "PURCHASE";
}

const debts: DebtRow[] = [
  { id: "r-401", kind: "receivable", counterparty_id: "c-201", counterparty_name: "Aminata", amount_minor: 120_000_00, settled_minor: 0, since: daysAgo(12), due_date: daysAgo(2), source: "SALE" },
  { id: "r-402", kind: "receivable", counterparty_id: "c-202", counterparty_name: "Foday", amount_minor: 45_000_00, settled_minor: 0, since: daysAgo(20), due_date: daysAgo(-6), source: "SALE" },
  { id: "p-501", kind: "payable", counterparty_id: "s-301", counterparty_name: "Musa Wholesale", amount_minor: 200_000_00, settled_minor: 50_000_00, since: daysAgo(9), due_date: daysAgo(-5), source: "PURCHASE" },
];

// Sale log: one row per sale (cash, credit, or partial) — the truthful basis for
// sales counts/totals in reports without double-counting partial sales.
const saleLog: { at: string; total_minor: number }[] = [];
// Seed the log from the seeded sale transactions so historic reports are truthful.
transactions
  .filter((t) => t.source === "SALE" && t.type === "INCOME")
  .forEach((t) => saleLog.push({ at: t.occurred_at, total_minor: t.amount.amount_minor }));

function toDebt(row: DebtRow): Debt {
  const outstanding = row.amount_minor - row.settled_minor;
  const overdue = row.due_date !== null && new Date(row.due_date).getTime() < Date.now() && outstanding > 0;
  return {
    id: row.id,
    counterparty_id: row.counterparty_id,
    counterparty_name: row.counterparty_name,
    amount: formatMoney(row.amount_minor),
    outstanding: formatMoney(outstanding),
    since: row.since,
    due_date: row.due_date,
    overdue,
    status: outstanding === 0 ? "SETTLED" : row.settled_minor > 0 ? "PARTIAL" : "OPEN",
  };
}

export function listDebts(kind: "receivable" | "payable"): Debt[] {
  return debts
    .filter((d) => d.kind === kind && d.amount_minor - d.settled_minor > 0)
    .map(toDebt)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.since.localeCompare(b.since));
}

export function outstandingTotal(kind: "receivable" | "payable"): number {
  return debts.filter((d) => d.kind === kind).reduce((a, d) => a + (d.amount_minor - d.settled_minor), 0);
}

// MOCK SIMPLIFICATION (documented): a credit sale records the CASH portion as an
// income transaction and the credit portion as a receivable. Booked-revenue vs
// cash accounting (Phase 2 §9 full model) arrives with the real backend; the
// dashboard here is the CASH view, which stays honest under this simplification.
export function createSale(input: CreateSaleInput, idempotencyKey: string | null): { result: SaleResult; replay: boolean } | null {
  if (idempotencyKey && saleIdempotency.has(idempotencyKey)) {
    return { result: saleIdempotency.get(idempotencyKey)!, replay: true };
  }
  const total = input.amount_minor;
  const paid = input.payment === "PAID" ? total : input.payment === "CREDIT" ? 0 : Math.min(input.amount_paid_minor ?? 0, total);
  const credit = total - paid;
  if (total <= 0 || paid < 0) return null;
  if (credit > 0 && !input.customer_id) return null;

  // Stock leaves via a SALE movement on the ledger (never a naked decrement).
  // Negative stock is allowed with a warning surface, not blocked (Phase 2 §10).
  const product = getProductRow(input.product_id);
  if (product && product.track) {
    addMovement(product.id, "SALE", -(input.quantity ?? 1), null);
  }

  let transaction = null;
  if (paid > 0) {
    transaction = createTransaction(
      {
        type: "INCOME",
        amount_minor: paid,
        description: input.description ?? product?.name,
        counterparty_id: input.customer_id,
        source: "SALE",
      },
      idempotencyKey ? `${idempotencyKey}:cash` : null,
    ).transaction;
  }
  let receivable: Debt | null = null;
  if (credit > 0) {
    const customer = customers.find((c) => c.id === input.customer_id);
    const row: DebtRow = {
      id: id("r"),
      kind: "receivable",
      counterparty_id: input.customer_id!,
      counterparty_name: customer?.name ?? "Customer",
      amount_minor: credit,
      settled_minor: 0,
      since: new Date().toISOString(),
      due_date: null,
      source: "SALE",
    };
    debts.push(row);
    receivable = toDebt(row);
  }
  saleLog.push({ at: new Date().toISOString(), total_minor: total });
  const result: SaleResult = { transaction, receivable, total: formatMoney(total) };
  if (idempotencyKey) saleIdempotency.set(idempotencyKey, result);
  return { result, replay: false };
}

const saleIdempotency = new Map<string, SaleResult>();

export function settleDebt(debtId: string, amountMinor: number): SettlementResult | null {
  const row = debts.find((d) => d.id === debtId);
  if (!row) return null;
  const outstanding = row.amount_minor - row.settled_minor;
  if (amountMinor <= 0 || amountMinor > outstanding) return null; // over-settlement rejected (Phase 2 M7)
  row.settled_minor += amountMinor;
  const isReceivable = row.kind === "receivable";
  const { transaction } = createTransaction(
    {
      type: isReceivable ? "INCOME" : "EXPENSE",
      amount_minor: amountMinor,
      description: isReceivable ? `Payment from ${row.counterparty_name}` : `Payment to ${row.counterparty_name}`,
      counterparty_id: row.counterparty_id,
      source: "SETTLEMENT",
    },
    null,
  );
  return { debt: toDebt(row), transaction };
}

export function attentionItems(): AttentionItem[] {
  const items: AttentionItem[] = [];
  const low = listProducts().filter((p) => p.low_stock);
  if (low.length > 0) {
    items.push({
      id: "att-low-stock",
      kind: "low_stock",
      severity: "warning",
      text: low.length === 1 ? `${low[0].name} is running low (${low[0].stock} left)` : `${low.length} products are running low`,
      target: "/stock",
    });
  }
  const owed = outstandingTotal("receivable");
  const owedCount = listDebts("receivable").length;
  if (owed > 0) {
    items.push({
      id: "att-owed",
      kind: "owed_to_you",
      severity: listDebts("receivable").some((d) => d.overdue) ? "danger" : "warning",
      text: `${owedCount} ${owedCount === 1 ? "customer owes" : "customers owe"} you ${formatMoney(owed).display}`,
      target: "/money?tab=owed",
    });
  }
  const owe = outstandingTotal("payable");
  if (owe > 0) {
    items.push({
      id: "att-owe",
      kind: "you_owe",
      severity: "warning",
      text: `You owe suppliers ${formatMoney(owe).display}`,
      target: "/money?tab=owe",
    });
  }
  return items;
}

// ============================================================
// MOCK: performance analytics — deterministic, computed from the transaction
// ledger (never hardcoded series). Percentage change vs the previous
// equal-length window is computed HERE, server-side (Phase 2 rule: the backend
// owns growth-rate math; the client only displays it).
// ============================================================
import type { PerfBucket, PerfRange, PerformanceResponse } from "@/shared/api/types";

const RANGE_DEF: Record<PerfRange, { unit: "day" | "week" | "month"; count: number }> = {
  "7d": { unit: "day", count: 7 },
  "30d": { unit: "day", count: 30 },
  "3m": { unit: "week", count: 13 },
  "6m": { unit: "month", count: 6 },
  "1y": { unit: "month", count: 12 },
};

function bucketStarts(unit: "day" | "week" | "month", count: number, endAnchor: Date): Date[] {
  const starts: Date[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(endAnchor);
    if (unit === "day") {
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
    } else if (unit === "week") {
      d.setDate(d.getDate() - i * 7);
      d.setHours(0, 0, 0, 0);
    } else {
      d.setMonth(d.getMonth() - i, 1);
      d.setHours(0, 0, 0, 0);
    }
    starts.push(d);
  }
  return starts;
}

function sumWindow(fromMs: number, toMs: number): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;
  for (const t of visibleTransactions()) {
    const ts = new Date(t.occurred_at).getTime();
    if (ts >= fromMs && ts < toMs) {
      if (t.type === "INCOME") income += t.amount.amount_minor;
      else expenses += t.amount.amount_minor;
    }
  }
  return { income, expenses };
}

export function performance(range: PerfRange): PerformanceResponse {
  const def = RANGE_DEF[range];
  const now = new Date();
  const starts = bucketStarts(def.unit, def.count, now);
  const ends = [...starts.slice(1).map((d) => d.getTime()), now.getTime() + 1];

  const buckets: PerfBucket[] = starts.map((start, i) => {
    const { income, expenses } = sumWindow(start.getTime(), ends[i]);
    const label =
      def.unit === "month"
        ? start.toLocaleDateString("en-GB", { month: "short" })
        : start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { label, income: formatMoney(income), expenses: formatMoney(expenses), net: formatMoney(income - expenses) };
  });

  const windowStart = starts[0].getTime();
  const windowEnd = now.getTime() + 1;
  const windowLen = windowEnd - windowStart;
  const cur = sumWindow(windowStart, windowEnd);
  const prev = sumWindow(windowStart - windowLen, windowStart);
  const curNet = cur.income - cur.expenses;
  const prevNet = prev.income - prev.expenses;

  // Zero/near-zero-base guard (Phase 2 §9 spirit): a percentage against a
  // negligible base is meaningless — return null rather than a silly number.
  let changePct: string | null = null;
  if (prevNet !== 0) {
    const pct = ((curNet - prevNet) / Math.abs(prevNet)) * 100;
    if (Math.abs(pct) <= 500) {
      changePct = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}`;
    }
  }
  const direction = curNet > prevNet ? "up" : curNet < prevNet ? "down" : "flat";

  return {
    range,
    buckets,
    totals: {
      income: formatMoney(cur.income),
      expenses: formatMoney(cur.expenses),
      net: formatMoney(curNet),
    },
    previous_net: formatMoney(prevNet),
    change_pct: changePct,
    direction,
  };
}

// ============================================================
// MOCK: reports — deterministic, computed from the ledgers. Cash view and
// booked profit are DIFFERENT truths and both are computed server-side
// (Phase 3 §6.1): profit includes credit extended and excludes debt
// collections/payments; the cash view is money actually received/paid.
// ============================================================
import type { ReportPeriod, ReportResponse } from "@/shared/api/types";

function reportWindow(period: ReportPeriod): { from: Date; to: Date; label: string } {
  const now = new Date();
  const from = new Date(now);
  let to = new Date(now);
  if (period === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setMonth(from.getMonth() - 1, 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const end = period === "last_month" ? new Date(to.getTime() - 1) : to;
  return { from, to, label: `${fmt(from)} – ${fmt(end)}` };
}

export function report(period: ReportPeriod): ReportResponse {
  const { from, to, label } = reportWindow(period);
  const inWindow = (iso: string) => {
    const ts = new Date(iso).getTime();
    return ts >= from.getTime() && ts < to.getTime();
  };
  const rows = visibleTransactions().filter((t) => inWindow(t.occurred_at));

  const cashIn = rows.filter((t) => t.type === "INCOME").reduce((a, t) => a + t.amount.amount_minor, 0);
  const cashOut = rows.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + t.amount.amount_minor, 0);

  // Booked view: revenue at the moment of sale (cash + credit extended),
  // debt collections/payments excluded so nothing is counted twice.
  const creditExtended = debts
    .filter((d) => d.kind === "receivable" && d.source === "SALE" && inWindow(d.since))
    .reduce((a, d) => a + d.amount_minor, 0);
  const bookedRevenue =
    rows.filter((t) => t.type === "INCOME" && t.source !== "SETTLEMENT").reduce((a, t) => a + t.amount.amount_minor, 0) +
    creditExtended;
  const creditPurchases = debts
    .filter((d) => d.kind === "payable" && d.source === "PURCHASE" && inWindow(d.since))
    .reduce((a, d) => a + d.amount_minor, 0);
  const bookedExpenses =
    rows.filter((t) => t.type === "EXPENSE" && t.source !== "SETTLEMENT").reduce((a, t) => a + t.amount.amount_minor, 0) +
    creditPurchases;

  const salesInWindow = saleLog.filter((s) => inWindow(s.at));
  const salesTotal = salesInWindow.reduce((a, s) => a + s.total_minor, 0);

  // Top products by units sold (SALE movements), revenue estimated at selling price.
  const units = new Map<string, number>();
  for (const p of listProducts(true)) {
    const sold = productMovements(p.id)
      .filter((m) => m.type === "SALE" && inWindow(m.occurred_at))
      .reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
    if (sold > 0) units.set(p.id, sold);
  }
  const topProducts = [...units.entries()]
    .map(([pid, sold]) => {
      const p = listProducts(true).find((x) => x.id === pid)!;
      return { name: p.name, units: sold, revenue_estimate: formatMoney(sold * p.selling_price.amount_minor) };
    })
    .sort((a, b) => b.revenue_estimate.amount_minor - a.revenue_estimate.amount_minor)
    .slice(0, 5);

  const byCategory = new Map<string, number>();
  rows
    .filter((t) => t.type === "EXPENSE")
    .forEach((t) => byCategory.set(t.category_name, (byCategory.get(t.category_name) ?? 0) + t.amount.amount_minor));
  const expensesByCategory = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total: formatMoney(total) }))
    .sort((a, b) => b.total.amount_minor - a.total.amount_minor);

  return {
    period,
    period_label: label,
    cash: { money_in: formatMoney(cashIn), money_out: formatMoney(cashOut), left_over: formatMoney(cashIn - cashOut) },
    profit: {
      booked_revenue: formatMoney(bookedRevenue),
      booked_expenses: formatMoney(bookedExpenses),
      profit: formatMoney(bookedRevenue - bookedExpenses),
      credit_extended: formatMoney(creditExtended),
    },
    sales: { count: salesInWindow.length, total: formatMoney(salesTotal), top_products: topProducts },
    expenses_by_category: expensesByCategory,
  };
}

export function reportCsv(period: ReportPeriod): string {
  const r = report(period);
  const { from, to } = reportWindow(period);
  const inWindow = (iso: string) => {
    const ts = new Date(iso).getTime();
    return ts >= from.getTime() && ts < to.getTime();
  };
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(`MI YONE report,${esc(business.name)},${esc(r.period_label)}`);
  lines.push("");
  lines.push("Summary,,Amount (Le)");
  lines.push(`Money in,,${r.cash.money_in.amount_minor / 100}`);
  lines.push(`Money out,,${r.cash.money_out.amount_minor / 100}`);
  lines.push(`Left over (cash),,${r.cash.left_over.amount_minor / 100}`);
  lines.push(`Profit (estimated),,${r.profit.profit.amount_minor / 100}`);
  lines.push(`Credit extended to customers,,${r.profit.credit_extended.amount_minor / 100}`);
  lines.push(`Sales count,,${r.sales.count}`);
  lines.push("");
  lines.push("Date,Type,Category,Description,Amount (Le),Recorded by");
  visibleTransactions()
    .filter((t) => inWindow(t.occurred_at))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .forEach((t) => {
      lines.push(
        [
          t.occurred_at.slice(0, 10),
          t.type === "INCOME" ? "Money in" : "Money out",
          esc(t.category_name),
          esc(t.description ?? ""),
          String(((t.type === "INCOME" ? 1 : -1) * t.amount.amount_minor) / 100),
          esc(t.recorded_by),
        ].join(","),
      );
    });
  return lines.join("\r\n");
}

export function err(code: ApiErrorBody["code"], message: string): ApiErrorBody {
  return { code, message, request_id: `req-${Math.random().toString(36).slice(2, 10)}` };
}

// ============================================================
// MOCK: Business Watch + progression/regression trends
// (parity with backend services/watch.py and analytics.trends —
//  deterministic, derived live from the mock's recorded data)
// ============================================================
import type { TrendMetric, TrendsResponse, WatchAlert, WatchResponse } from "@/shared/api/types";

const SALES_DOWN_WARN = 15;
const SALES_DOWN_CRIT = 30;
const PROFIT_DOWN_WARN = 20;
const EXPENSES_UP_WARN = 40;
const EXPENSES_UP_CRIT = 100;
const UNUSUAL_COST_HIGH = 1.5;
const UNUSUAL_COST_LOW = 0.5;
const PCT_GUARD = 500;
const WINDOW_MS = 7 * 86400000;

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return Math.abs(pct) <= PCT_GUARD ? pct : null;
}

export function computeWatch(): WatchResponse {
  const now = Date.now();
  const alerts: WatchAlert[] = [];
  const active = productRows.filter((r) => !r.archived && r.track);
  const levels = active.map((r) => ({ r, s: stockOf(r.id) }));
  const moved = new Set(movements.map((m) => m.product_id));
  const out = levels.filter(({ r, s }) => s <= 0 && moved.has(r.id));
  const low = levels.filter(({ s, r }) => s > 0 && s <= r.threshold);
  if (out.length > 0) {
    alerts.push({
      id: "watch-out-of-stock", severity: "critical",
      what: out.length === 1 ? `${out[0].r.name} is sold out.` : `${out.length} products are sold out.`,
      why: "You cannot sell what you do not have — every day out of stock is lost sales.",
      action: "Restock as soon as you can, or mark the product archived if you no longer sell it.",
      target: "/stock",
    });
  }
  if (low.length > 0) {
    const { r, s } = low[0];
    alerts.push({
      id: "watch-low-stock", severity: "warning",
      what:
        low.length === 1
          ? `${r.name} is running low — only ${s} ${r.unit}${s !== 1 && !r.unit.endsWith("s") ? "s" : ""} left.`
          : `${low.length} products are running low on stock.`,
      why: "Running out mid-week can cost you sales and send customers elsewhere.",
      action: "Plan a restock before it runs out.",
      target: "/stock",
    });
  }

  const overdue = debts.filter(
    (d) => d.kind === "receivable" && d.amount_minor - d.settled_minor > 0 && d.due_date !== null && new Date(d.due_date).getTime() < now,
  );
  if (overdue.length > 0) {
    const total = overdue.reduce((a, d) => a + d.amount_minor - d.settled_minor, 0);
    const oldestDays = Math.max(...overdue.map((d) => (now - new Date(d.due_date as string).getTime()) / 86400000));
    alerts.push({
      id: "watch-overdue", severity: oldestDays > 30 ? "critical" : "warning",
      what:
        overdue.length === 1
          ? `1 customer payment is overdue — ${overdue[0].counterparty_name} owes ${formatMoney(total).display}.`
          : `${overdue.length} customer payments are overdue — ${formatMoney(total).display} in total.`,
      why: "Money owed to you is cash you cannot use, and old debts get harder to collect.",
      action: "Send a reminder, or agree a payment date you can follow up on.",
      target: "/money?tab=owed",
    });
  }

  const payableOverdue = debts.filter(
    (d) => d.kind === "payable" && d.amount_minor - d.settled_minor > 0 && d.due_date !== null && new Date(d.due_date).getTime() < now,
  );
  if (payableOverdue.length > 0) {
    const total = payableOverdue.reduce((a, d) => a + d.amount_minor - d.settled_minor, 0);
    alerts.push({
      id: "watch-payable-due", severity: "warning",
      what: `You owe suppliers ${formatMoney(total).display} past the agreed date.`,
      why: "Paying late can strain the supplier relationships your stock depends on.",
      action: "Settle what you can, or talk to the supplier about a new date.",
      target: "/money?tab=owe",
    });
  }

  const curStart = now - WINDOW_MS;
  const prevStart = now - 2 * WINDOW_MS;
  const at = (iso: string) => new Date(iso).getTime();

  const curSales = saleLog.filter((s) => at(s.at) >= curStart).reduce((a, s) => a + s.total_minor, 0);
  const prevSales = saleLog.filter((s) => at(s.at) >= prevStart && at(s.at) < curStart).reduce((a, s) => a + s.total_minor, 0);
  const salesPct = pctChange(curSales, prevSales);
  const salesFell = salesPct !== null && salesPct <= -SALES_DOWN_WARN;
  if (salesFell && salesPct !== null) {
    alerts.push({
      id: "watch-sales-down", severity: salesPct <= -SALES_DOWN_CRIT ? "critical" : "warning",
      what: `Sales have fallen ${Math.abs(salesPct).toFixed(0)}% compared with your previous week (${formatMoney(curSales).display} vs ${formatMoney(prevSales).display}).`,
      why: "A falling week can mean missing stock, fewer customers, or a price problem.",
      action: "Check your top products and stock levels, and ask regular customers what changed.",
      target: "/insights",
    });
  }

  const txs = visibleTransactions();
  const winSum = (type: Transaction["type"], from: number, to: number) =>
    txs.filter((t) => t.type === type && at(t.occurred_at) >= from && at(t.occurred_at) < to).reduce((a, t) => a + t.amount.amount_minor, 0);
  const curExp = winSum("EXPENSE", curStart, now + 1);
  const prevExp = winSum("EXPENSE", prevStart, curStart);
  const expPct = pctChange(curExp, prevExp);
  if (expPct !== null && expPct >= EXPENSES_UP_WARN) {
    const byCat = new Map<string, [number, number]>();
    txs
      .filter((t) => t.type === "EXPENSE" && at(t.occurred_at) >= prevStart)
      .forEach((t) => {
        const cur = byCat.get(t.category_name) ?? [0, 0];
        cur[at(t.occurred_at) >= curStart ? 0 : 1] += t.amount.amount_minor;
        byCat.set(t.category_name, cur);
      });
    const driver = [...byCat.entries()].sort((a, b) => (b[1][0] - b[1][1]) - (a[1][0] - a[1][1]))[0];
    alerts.push({
      id: "watch-expenses-up", severity: expPct >= EXPENSES_UP_CRIT ? "critical" : "warning",
      what: `Money out is ${expPct.toFixed(0)}% higher than your previous week (${formatMoney(curExp).display} vs ${formatMoney(prevExp).display}).`,
      why:
        driver && driver[1][0] > driver[1][1]
          ? `${driver[0]} is the biggest driver (${formatMoney(driver[1][0]).display} this week vs ${formatMoney(driver[1][1]).display} the week before).`
          : "Costs rising faster than sales quietly eat your profit.",
      action: "Open the week's spending and check each large record is right and necessary.",
      target: "/money?tab=out",
    });
  }

  const curIn = winSum("INCOME", curStart, now + 1);
  const prevIn = winSum("INCOME", prevStart, curStart);
  const curLeft = curIn - curExp;
  const prevLeft = prevIn - prevExp;
  if (!salesFell && prevLeft > 0) {
    const leftPct = curLeft >= 0 ? pctChange(curLeft, prevLeft) : -100;
    if (leftPct !== null && leftPct <= -PROFIT_DOWN_WARN) {
      alerts.push({
        id: "watch-profit-down", severity: "warning",
        what: `You kept ${Math.abs(leftPct).toFixed(0)}% less this week than last (${formatMoney(curLeft).display} vs ${formatMoney(prevLeft).display}).`,
        why: "Sales held up, but you kept less of them — costs are eating the difference.",
        action: "Compare this week's spending with last week's to see where the money went.",
        target: "/insights",
      });
    }
  }

  for (const m of movements) {
    if (m.type !== "PURCHASE" || m.unit_cost === null || at(m.occurred_at) < curStart) continue;
    const row = productRows.find((r) => r.id === m.product_id);
    if (!row || row.cost_minor <= 0) continue;
    const ratio = m.unit_cost.amount_minor / row.cost_minor;
    if (ratio >= UNUSUAL_COST_HIGH || ratio <= UNUSUAL_COST_LOW) {
      alerts.push({
        id: `watch-unusual-cost-${m.id}`, severity: "info",
        what: `You recorded ${formatMoney(m.unit_cost.amount_minor).display} per unit for ${row.name} — usually about ${formatMoney(row.cost_minor).display}.`,
        why: "It could be a real price change, or a slip when recording.",
        action: "Check the record; if the price really changed, update the product's cost.",
        target: "/stock",
      });
      break; // one representative alert — never a wall of duplicates
    }
  }

  const monthStart = now - 30 * 86400000;
  const vague = txs.filter(
    (t) => t.type === "EXPENSE" && at(t.occurred_at) >= monthStart && t.category_name === "General expense" && !(t.description ?? "").trim(),
  );
  if (vague.length >= 3) {
    alerts.push({
      id: "watch-incomplete", severity: "info",
      what: `${vague.length} money-out records this month have no category or note.`,
      why: "Records that say nothing make it impossible to see where money goes.",
      action: "Open them and add a category or a short note while you still remember.",
      target: "/money?tab=out",
    });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return { alerts };
}

const TREND_RANGES: Record<string, number> = { "7d": 7, "30d": 30, "3m": 91, "6m": 182, "1y": 365 };
const TREND_FLAT_PCT = 5;

function trendMetric(
  key: TrendMetric["key"],
  cur: number,
  prev: number,
  display: string,
  goodWhenUp: boolean,
  hasHistory: boolean,
): TrendMetric {
  let changePct: string | null = null;
  let direction: TrendMetric["direction"] = null;
  if (hasHistory && prev > 0) {
    const pct = ((cur - prev) / prev) * 100;
    if (Math.abs(pct) <= PCT_GUARD) {
      changePct = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}`;
      direction = Math.abs(pct) < TREND_FLAT_PCT ? "flat" : pct > 0 ? "up" : "down";
    }
  } else if (hasHistory && prev === 0 && cur === 0) {
    direction = "flat";
  }
  let tone: TrendMetric["tone"] = "neutral";
  if (direction === "up") tone = goodWhenUp ? "good" : "bad";
  else if (direction === "down") tone = goodWhenUp ? "bad" : "good";
  return { key, current: display, change_pct: changePct, direction, tone };
}

export function computeTrends(range: string): TrendsResponse {
  const days = TREND_RANGES[range] ?? 30;
  const now = Date.now();
  const curStart = now - days * 86400000;
  const prevStart = now - 2 * days * 86400000;
  const at = (iso: string) => new Date(iso).getTime();

  const txs = visibleTransactions();
  const hasHistory = txs.some((t) => at(t.occurred_at) < curStart);
  const winSum = (type: Transaction["type"], from: number, to: number) =>
    txs.filter((t) => t.type === type && at(t.occurred_at) >= from && at(t.occurred_at) < to).reduce((a, t) => a + t.amount.amount_minor, 0);

  const curSales = saleLog.filter((s) => at(s.at) >= curStart).reduce((a, s) => a + s.total_minor, 0);
  const prevSales = saleLog.filter((s) => at(s.at) >= prevStart && at(s.at) < curStart).reduce((a, s) => a + s.total_minor, 0);
  const curIn = winSum("INCOME", curStart, now + 1);
  const prevIn = winSum("INCOME", prevStart, curStart);
  const curOut = winSum("EXPENSE", curStart, now + 1);
  const prevOut = winSum("EXPENSE", prevStart, curStart);
  const curUnits = movements.filter((m) => m.type === "SALE" && at(m.occurred_at) >= curStart).reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
  const prevUnits = movements
    .filter((m) => m.type === "SALE" && at(m.occurred_at) >= prevStart && at(m.occurred_at) < curStart)
    .reduce((a, m) => a + Math.abs(m.quantity_delta), 0);

  const receivables = debts.filter((d) => d.kind === "receivable");
  const outstandingNow = receivables.reduce((a, d) => a + d.amount_minor - d.settled_minor, 0);
  const newCredit = receivables.filter((d) => at(d.since) >= curStart).reduce((a, d) => a + d.amount_minor, 0);
  const collected = txs
    .filter((t) => t.type === "INCOME" && t.source === "SETTLEMENT" && at(t.occurred_at) >= curStart)
    .reduce((a, t) => a + t.amount.amount_minor, 0);
  const outstandingStart = outstandingNow - newCredit + collected;

  // Contribution analysis (M17) — parity with analytics.trends contributors:
  // largest measured change per dimension; factual, never causal; withheld
  // without history.
  const contributors: { id: string; text: string }[] = [];
  if (hasHistory) {
    const curCat = new Map<string, number>();
    const prevCat = new Map<string, number>();
    txs.forEach((t) => {
      if (t.type !== "EXPENSE") return;
      const ts = at(t.occurred_at);
      if (ts >= curStart) curCat.set(t.category_name, (curCat.get(t.category_name) ?? 0) + t.amount.amount_minor);
      else if (ts >= prevStart) prevCat.set(t.category_name, (prevCat.get(t.category_name) ?? 0) + t.amount.amount_minor);
    });
    const catDeltas = [...new Set([...curCat.keys(), ...prevCat.keys()])]
      .map((n): [string, number] => [n, (curCat.get(n) ?? 0) - (prevCat.get(n) ?? 0)])
      .filter(([, d]) => d !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (catDeltas.length > 0) {
      const [n, d] = catDeltas[0];
      contributors.push({
        id: "contrib-spending",
        text: `${n} spending ${d > 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(d)).display} — the largest change in your spending compared with the period before.`,
      });
    }
    const curU = new Map<string, number>();
    const prevU = new Map<string, number>();
    movements.forEach((m) => {
      if (m.type !== "SALE") return;
      const ts = at(m.occurred_at);
      if (ts >= curStart) curU.set(m.product_id, (curU.get(m.product_id) ?? 0) + Math.abs(m.quantity_delta));
      else if (ts >= prevStart) prevU.set(m.product_id, (prevU.get(m.product_id) ?? 0) + Math.abs(m.quantity_delta));
    });
    const unitDeltas = [...new Set([...curU.keys(), ...prevU.keys()])]
      .map((pid): [string, number] => [pid, (curU.get(pid) ?? 0) - (prevU.get(pid) ?? 0)])
      .filter(([, d]) => d !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (unitDeltas.length > 0) {
      const [pid, d] = unitDeltas[0];
      const p = productRows.find((r) => r.id === pid);
      if (p) {
        contributors.push({
          id: "contrib-sales",
          text: `${p.name} sold ${Math.abs(d)} ${d > 0 ? "more" : "fewer"} unit${Math.abs(d) !== 1 ? "s" : ""} than the period before — the biggest change in what you sold.`,
        });
      }
    }
    const dIn = curIn - prevIn;
    const dOut = curOut - prevOut;
    if (dIn !== 0 || dOut !== 0) {
      const sideIn = Math.abs(dIn) >= Math.abs(dOut);
      const d = sideIn ? dIn : dOut;
      contributors.push({
        id: "contrib-left-over",
        text: `Money ${sideIn ? "in" : "out"} moved most: ${d > 0 ? "up" : "down"} ${formatMoney(Math.abs(d)).display} compared with the period before — the biggest influence on what you kept.`,
      });
    }
  }

  return {
    range,
    metrics: [
      trendMetric("sales", curSales, prevSales, formatMoney(curSales).display, true, hasHistory),
      trendMetric("money_out", curOut, prevOut, formatMoney(curOut).display, false, hasHistory),
      trendMetric("left_over", curIn - curOut, prevIn - prevOut, formatMoney(curIn - curOut).display, true, hasHistory),
      trendMetric("units_sold", curUnits, prevUnits, String(curUnits), true, hasHistory),
      trendMetric("owed_to_you", outstandingNow, outstandingStart, formatMoney(outstandingNow).display, false, hasHistory && outstandingStart > 0),
    ],
    contributors,
  };
}

// ============================================================
// MOCK: Scan-to-Sell checkout — parity with trade.checkout (multi-item cash
// sale from the SAME primitives; server-side totals + stock validation)
// ============================================================
export interface CheckoutLine {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: Money;
  line_total: Money;
}
export interface CheckoutResult {
  transaction: Transaction | null;
  total: Money;
  lines: CheckoutLine[];
}

const checkoutIdempotency = new Map<string, CheckoutResult>();

export function checkout(
  items: { product_id?: unknown; quantity?: unknown }[],
  idempotencyKey: string | null,
): { result: CheckoutResult; replay: boolean } | { error: string } {
  if (idempotencyKey && checkoutIdempotency.has(idempotencyKey)) {
    return { result: checkoutIdempotency.get(idempotencyKey)!, replay: true };
  }
  if (!Array.isArray(items) || items.length === 0) return { error: "Scan at least one product first." };
  const seen = new Set<string>();
  const lines: { row: ProductRow; quantity: number }[] = [];
  for (const raw of items) {
    const pid = String(raw.product_id ?? "");
    const qty = raw.quantity;
    if (seen.has(pid)) return { error: "The same product appears twice — combine the quantities." };
    seen.add(pid);
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
      return { error: "Each scanned product needs a quantity of at least 1." };
    }
    const row = getProductRow(pid);
    if (!row || row.archived) return { error: "One of the scanned products is not in your records." };
    if (row.track) {
      const available = stockOf(row.id);
      if (qty > available) return { error: `Not enough ${row.name} in stock — only ${available} left.` };
    }
    lines.push({ row, quantity: qty });
  }
  const total = lines.reduce((a, l) => a + l.row.selling_minor * l.quantity, 0);
  if (total <= 0) return { error: "This sale could not be recorded." };

  for (const l of lines) if (l.row.track) addMovement(l.row.id, "SALE", -l.quantity, null);
  const description = lines.map((l) => `${l.row.name} ×${l.quantity}`).join(", ").slice(0, 500);
  const { transaction: tx } = createTransaction(
    { type: "INCOME", amount_minor: total, description, source: "SALE" },
    idempotencyKey ? `${idempotencyKey}:cash` : null,
  );
  saleLog.push({ at: new Date().toISOString(), total_minor: total });
  const result: CheckoutResult = {
    transaction: tx,
    total: formatMoney(total),
    lines: lines.map((l) => ({
      product_id: l.row.id,
      name: l.row.name,
      quantity: l.quantity,
      unit_price: formatMoney(l.row.selling_minor),
      line_total: formatMoney(l.row.selling_minor * l.quantity),
    })),
  };
  if (idempotencyKey) checkoutIdempotency.set(idempotencyKey, result);
  return { result, replay: false };
}
