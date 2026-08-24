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

export const transactions: Transaction[] = [
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

// --- Idempotency (Phase 2 §21): key → transaction id, replay returns the original ---
const idempotency = new Map<string, string>();

export function createTransaction(
  input: { type: Transaction["type"]; amount_minor: number; description?: string; source: Transaction["source"] },
  idempotencyKey: string | null,
): { transaction: Transaction; replay: boolean } {
  if (idempotencyKey && idempotency.has(idempotencyKey)) {
    const existing = transactions.find((t) => t.id === idempotency.get(idempotencyKey));
    if (existing) return { transaction: existing, replay: true };
  }
  const now = new Date().toISOString();
  const t: Transaction = {
    id: id("t"),
    business_id: business.id,
    type: input.type,
    status: "POSTED",
    amount: formatMoney(input.amount_minor),
    category_name: input.type === "INCOME" ? "Sales" : "General expense",
    description: input.description ?? null,
    occurred_at: now,
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

// --- Correction = reversal + corrected record, atomically (Phase 2 §8) ---
export function fixTransaction(txId: string, newAmountMinor: number): Transaction | null {
  const original = transactions.find((t) => t.id === txId && t.status === "POSTED");
  if (!original) return null;
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
    occurred_at: original.occurred_at,
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

  const attention: AttentionItem[] = [];

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

export function err(code: ApiErrorBody["code"], message: string): ApiErrorBody {
  return { code, message, request_id: `req-${Math.random().toString(36).slice(2, 10)}` };
}
