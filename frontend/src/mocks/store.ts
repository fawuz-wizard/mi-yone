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

  return {
    business,
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
    insight,
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

export const customers: Customer[] = [
  { id: "c-201", name: "Aminata", phone: "+232 76 000001" },
  { id: "c-202", name: "Foday", phone: "+232 76 000002" },
  { id: "c-203", name: "Isatu", phone: null },
];

export const suppliers: Supplier[] = [{ id: "s-301", name: "Musa Wholesale", phone: "+232 76 000009" }];

interface DebtRow {
  id: string;
  kind: "receivable" | "payable";
  counterparty_id: string;
  counterparty_name: string;
  amount_minor: number;
  settled_minor: number;
  since: string;
  due_date: string | null;
}

const debts: DebtRow[] = [
  { id: "r-401", kind: "receivable", counterparty_id: "c-201", counterparty_name: "Aminata", amount_minor: 120_000_00, settled_minor: 0, since: daysAgo(12), due_date: daysAgo(2) },
  { id: "r-402", kind: "receivable", counterparty_id: "c-202", counterparty_name: "Foday", amount_minor: 45_000_00, settled_minor: 0, since: daysAgo(20), due_date: daysAgo(-6) },
  { id: "p-501", kind: "payable", counterparty_id: "s-301", counterparty_name: "Musa Wholesale", amount_minor: 200_000_00, settled_minor: 50_000_00, since: daysAgo(9), due_date: daysAgo(-5) },
];

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
      { type: "INCOME", amount_minor: paid, description: input.description ?? product?.name, source: "SALE" },
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
    };
    debts.push(row);
    receivable = toDebt(row);
  }
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

export function err(code: ApiErrorBody["code"], message: string): ApiErrorBody {
  return { code, message, request_id: `req-${Math.random().toString(36).slice(2, 10)}` };
}
