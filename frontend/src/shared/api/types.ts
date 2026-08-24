// API contract types — hand-written to the Phase 2 (Rev 2) contract.
// TODO(backend): replace with OpenAPI-generated types once the FastAPI backend exists.
// Money is integer minor units + a server-formatted display string; the client never
// computes authoritative financial values (Phase 5 Rule 2).

export interface Money {
  amount_minor: number;
  currency: "SLE";
  display: string; // e.g. "Le 45,000" — rendered verbatim
}

export type TransactionType = "INCOME" | "EXPENSE";
export type TransactionStatus = "POSTED" | "REVERSED";
export type TransactionSource = "MANUAL" | "SALE" | "SETTLEMENT";

export interface Transaction {
  id: string;
  business_id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: Money;
  category_name: string;
  description: string | null;
  occurred_at: string; // ISO
  created_at: string;
  recorded_by: string;
  source: TransactionSource;
  reverses_transaction_id: string | null;
  fixed?: { by: string; was: Money; now: Money } | null;
}

export interface Business {
  id: string;
  name: string;
  currency: "SLE";
  initial: string;
}

export interface HealthPeriod {
  period: "today" | "week" | "month";
  money_in: Money;
  money_out: Money;
  left_over: Money;
  comparison: string | null; // server-phrased, e.g. "Le 240,000 more than last month ↑"
  trend: number[]; // sparkline series (relative values)
  pending_count: number;
}

export interface AttentionItem {
  id: string;
  kind: "low_stock" | "owed_to_you" | "you_owe" | "unusual_spending";
  severity: "warning" | "danger";
  text: string;
  target: string; // deep link to the screen where the fix happens
}

export interface Insight {
  id: string;
  statement: string;
  figure: string;
  context: string;
  action_label: string;
  action_target: string;
}

export interface DashboardResponse {
  business: Business;
  health: HealthPeriod;
  attention: AttentionItem[];
  insight: Insight | null;
}

export interface ApiErrorBody {
  code:
    | "VALIDATION_ERROR"
    | "AUTH_REQUIRED"
    | "AUTH_INVALID"
    | "PERMISSION_DENIED"
    | "TENANT_NOT_FOUND"
    | "NOT_FOUND"
    | "CONFLICT"
    | "IDEMPOTENCY_REPLAY"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";
  message: string;
  details?: { field: string; issue: string }[];
  request_id?: string;
}

export interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: { page: number; per_page: number; total: number };
}

export interface Product {
  id: string;
  name: string;
  price: Money;
  stock: number;
  low_stock_threshold: number;
  track_inventory: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
}

/** Receivable ("Owes you") / Payable ("You owe") — user language, server truth. */
export interface Debt {
  id: string;
  counterparty_id: string;
  counterparty_name: string;
  amount: Money; // original amount
  outstanding: Money; // derived server-side from settlements
  since: string; // ISO date the debt started
  due_date: string | null;
  overdue: boolean;
  status: "OPEN" | "PARTIAL" | "SETTLED";
}

export interface CreateSaleInput {
  amount_minor: number;
  product_id?: string;
  quantity?: number;
  payment: "PAID" | "CREDIT" | "PARTIAL";
  amount_paid_minor?: number; // for PARTIAL
  customer_id?: string; // required for CREDIT/PARTIAL
  description?: string;
}

export interface SaleResult {
  transaction: Transaction | null; // the cash portion (null for full-credit sale)
  receivable: Debt | null; // the credit portion
  total: Money;
}

export interface CreateSettlementInput {
  amount_minor: number;
}

export interface SettlementResult {
  debt: Debt;
  transaction: Transaction;
}

export interface CreateTransactionInput {
  type: TransactionType;
  amount_minor: number;
  description?: string;
  occurred_at?: string;
  source: TransactionSource;
}

export interface FixTransactionInput {
  amount_minor: number;
  reason: string;
}
