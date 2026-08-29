// MOCK Partner AI — parity with backend app/ai (evidence.py + LocalComposer).
// Deterministic: routes the question, builds grounded sentences from the mock's
// own recorded data, and never invents a figure. Clearly labeled MOCK.
import {
  computeTrends,
  computeWatch,
  formatMoney,
  listDebts,
  listProducts,
  productMovements,
  report,
  visibleTransactions,
} from "./store";
import type { Product } from "@/shared/api/types";

export interface PartnerMessage {
  id: string;
  role: "owner" | "partner";
  text: string;
  intent: string | null;
  created_at: string;
}

const messages: PartnerMessage[] = [];
let seq = 0;
const mid = () => `aim-mock-${(seq += 1)}`;

const money = (m: number) => formatMoney(m).display;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function productTokens(p: Product): Set<string> {
  return new Set(tokens(p.name).filter((t) => t.length >= 3 && !/^\d/.test(t)));
}

function route(question: string): { intent: string; product: Product | null } {
  const q = question.toLowerCase();
  const words = new Set(tokens(question));
  const has = (...ws: string[]) => ws.some((w) => words.has(w));

  // Best-score match: "palm oil" must beat "cooking oil" on the shared token.
  let matched: Product | null = null;
  let best = 0;
  for (const p of listProducts(false)) {
    const score = [...productTokens(p)].filter((t) => words.has(t)).length;
    if (score > best) {
      best = score;
      matched = p;
    }
  }
  if (has("attention", "focus", "worry", "watch", "problem", "problems")) return { intent: "attention", product: null };
  if (words.has("compare") || q.includes("last month") || q.includes(" vs ")) return { intent: "compare", product: null };
  if (matched) return { intent: "product", product: matched };
  if (has("profit", "keep", "kept") && has("why", "decrease", "decreased", "drop", "dropped", "down", "less", "fell", "fall"))
    return { intent: "profit_why", product: null };
  if (has("expense", "expenses", "spend", "spending", "spent", "cost", "costs")) return { intent: "expenses", product: null };
  if (has("stock", "inventory")) return { intent: "stock_why", product: null };
  if (has("selling", "sellers", "bestseller", "best", "top") && (q.includes("product") || words.has("selling")))
    return { intent: "top_products", product: null };
  if (has("owe", "owes", "owed", "debt", "debts", "credit")) return { intent: "debts", product: null };
  if (has("doing", "performance", "performing", "going", "profit", "made", "make", "sales", "business"))
    return { intent: "overview", product: null };
  return { intent: "help", product: null };
}

const HELP_TEXT =
  'I can explain what’s in your business records. Try asking: "How is my business doing this month?", ' +
  '"Why did my profit decrease?", "What are my biggest expenses?", "Which products are selling the most?", ' +
  '"Who owes me money?", or "What should I pay attention to?" I only use your recorded data — I never make figures up.';

function overview(question: string): string[] {
  const period = question.toLowerCase().includes("week") ? ("week" as const) : ("month" as const);
  const r = report(period);
  const label = period === "week" ? "this week" : "this month";
  if (r.cash.money_in.amount_minor === 0 && r.cash.money_out.amount_minor === 0) {
    return [
      `I don't have any money records for ${label} yet, so I can't describe performance. Record a few sales and expenses and I'll have something real to work with.`,
    ];
  }
  const facts = [
    `From your records ${label}: money in ${r.cash.money_in.display}, money out ${r.cash.money_out.display}, left over ${r.cash.left_over.display}, across ${r.sales.count} sales.`,
    `Estimated profit ${label} (including credit you extended): ${r.profit.profit.display}.`,
  ];
  const s = computeTrends("30d").metrics.find((m) => m.key === "sales");
  if (!s || s.direction === null) {
    facts.push("I don't have enough history before this period to say whether sales are trending up or down yet.");
  } else {
    const word = s.direction === "up" ? "up" : s.direction === "down" ? "down" : "steady";
    facts.push(`Compared with the 30 days before, sales are ${word}${s.change_pct ? ` (${s.change_pct}%)` : ""}.`);
  }
  const alerts = computeWatch().alerts;
  if (alerts.length > 0) {
    facts.push(`Business Watch has ${alerts.length} thing${alerts.length !== 1 ? "s" : ""} for you — the top one: ${alerts[0].what}`);
  } else {
    facts.push("Business Watch shows nothing needing attention right now.");
  }
  return facts;
}

function windows() {
  const now = Date.now();
  const curStart = now - 30 * 86400000;
  const prevStart = now - 60 * 86400000;
  const rows = visibleTransactions();
  const at = (iso: string) => new Date(iso).getTime();
  const sum = (type: "INCOME" | "EXPENSE", from: number, to: number) =>
    rows.filter((t) => t.type === type && at(t.occurred_at) >= from && at(t.occurred_at) < to).reduce((a, t) => a + t.amount.amount_minor, 0);
  return {
    rows,
    curStart,
    prevStart,
    curIn: sum("INCOME", curStart, now + 1),
    curOut: sum("EXPENSE", curStart, now + 1),
    prevIn: sum("INCOME", prevStart, curStart),
    prevOut: sum("EXPENSE", prevStart, curStart),
  };
}

const pct = (cur: number, prev: number): number | null => {
  if (prev <= 0) return null;
  const p = ((cur - prev) / prev) * 100;
  return Math.abs(p) <= 500 ? p : null;
};

function profitWhy(): string[] {
  const w = windows();
  if (w.prevIn === 0 && w.prevOut === 0) {
    return ["I don't have enough history to explain a profit change — there are no records in the previous 30-day period to compare against."];
  }
  const curLeft = w.curIn - w.curOut;
  const prevLeft = w.prevIn - w.prevOut;
  const facts = [`From your records: over the last 30 days you kept ${money(curLeft)}, against ${money(prevLeft)} in the 30 days before.`];
  const inPct = pct(w.curIn, w.prevIn);
  const outPct = pct(w.curOut, w.prevOut);
  if (inPct !== null) facts.push(`Money in moved ${inPct >= 0 ? "+" : ""}${inPct.toFixed(0)}% (${money(w.curIn)} vs ${money(w.prevIn)}).`);
  if (outPct !== null) facts.push(`Money out moved ${outPct >= 0 ? "+" : ""}${outPct.toFixed(0)}% (${money(w.curOut)} vs ${money(w.prevOut)}).`);
  const byCat = new Map<string, [number, number]>();
  const at = (iso: string) => new Date(iso).getTime();
  w.rows
    .filter((t) => t.type === "EXPENSE" && at(t.occurred_at) >= w.prevStart)
    .forEach((t) => {
      const cur = byCat.get(t.category_name) ?? [0, 0];
      cur[at(t.occurred_at) >= w.curStart ? 0 : 1] += t.amount.amount_minor;
      byCat.set(t.category_name, cur);
    });
  const driver = [...byCat.entries()].sort((a, b) => b[1][0] - b[1][1] - (a[1][0] - a[1][1]))[0];
  if (driver && driver[1][0] > driver[1][1]) {
    facts.push(`The biggest cost change is ${driver[0]}: ${money(driver[1][0])} this period vs ${money(driver[1][1])} before.`);
  }
  if (curLeft < prevLeft) {
    if (inPct !== null && outPct !== null && outPct > inPct) facts.push("My read: costs grew faster than sales — that's what squeezed what you kept.");
    else if (inPct !== null && inPct < 0) facts.push("My read: the drop mainly follows lower money in.");
  } else {
    facts.push("My read: you actually kept more this period than the one before.");
  }
  return facts;
}

function expenses(): string[] {
  const r = report("month");
  if (r.expenses_by_category.length === 0) return ["You have no expenses recorded this month yet, so there's nothing to rank."];
  const top = r.expenses_by_category.slice(0, 3).map((c) => `${c.name} (${c.total.display})`).join(", ");
  return [`From your records this month: your biggest expenses are ${top}.`, `Total money out this month: ${r.cash.money_out.display}.`];
}

function topProducts(): string[] {
  const r = report("month");
  if (r.sales.top_products.length === 0) {
    return ["No product sales are recorded this month yet, so I can't rank products. Sales recorded without picking a product don't count toward product rankings."];
  }
  const lines = r.sales.top_products.slice(0, 3).map((p) => `${p.name} (${p.units} sold, about ${p.revenue_estimate.display})`).join(", ");
  return [
    `From your records this month, your top products are: ${lines}.`,
    "Product revenue is estimated from units sold at each product's current price — individual sale prices can differ.",
  ];
}

function productFacts(p: Product): string[] {
  const now = Date.now();
  const monthStart = now - 30 * 86400000;
  const at = (iso: string) => new Date(iso).getTime();
  const moves = productMovements(p.id);
  const sold = moves.filter((m) => m.type === "SALE" && at(m.occurred_at) >= monthStart).reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
  const facts: string[] = [];
  const plural = (n: number) => (n !== 1 && !p.unit.endsWith("s") ? "s" : "");
  if (sold === 0) {
    facts.push(`I don't have any recorded sales of ${p.name} in the last 30 days.`);
  } else {
    const est = sold * p.selling_price.amount_minor;
    facts.push(
      `From your records: ${sold} ${p.unit}${plural(sold)} of ${p.name} sold in the last 30 days — roughly ${money(est)} at your current price of ${p.selling_price.display} (an estimate; individual sale prices can differ).`,
    );
  }
  const prevSold = moves
    .filter((m) => m.type === "SALE" && at(m.occurred_at) >= now - 60 * 86400000 && at(m.occurred_at) < monthStart)
    .reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
  if (prevSold > 0) {
    const p2 = pct(sold, prevSold);
    if (p2 !== null) facts.push(`That's ${p2 >= 0 ? "+" : ""}${p2.toFixed(0)}% versus the 30 days before (${prevSold} sold then).`);
  } else if (sold > 0) {
    facts.push("There's no earlier sales history for this product yet, so I can't call a trend.");
  }
  if (p.track_inventory) {
    const low = p.stock <= p.low_stock_threshold;
    facts.push(`Current stock: ${p.stock} ${p.unit}${plural(p.stock)}${low ? " — that is at or below your low-stock level" : ""}.`);
  }
  return facts;
}

function stockWhy(): string[] {
  const now = Date.now();
  const start = now - 30 * 86400000;
  const at = (iso: string) => new Date(iso).getTime();
  const outs: { name: string; n: number }[] = [];
  let damaged = 0;
  for (const p of listProducts(true)) {
    const moves = productMovements(p.id).filter((m) => at(m.occurred_at) >= start && m.quantity_delta < 0);
    const sold = moves.filter((m) => m.type === "SALE").reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
    damaged += moves.filter((m) => m.type !== "SALE").reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
    if (sold > 0) outs.push({ name: p.name, n: sold });
  }
  if (outs.length === 0 && damaged === 0) {
    return ["Your records show no stock leaving in the last 30 days, so I can't point at a cause. If shelves look emptier than the app says, a stock check will set the record straight."];
  }
  const facts: string[] = [];
  if (outs.length > 0) {
    const line = outs.sort((a, b) => b.n - a.n).slice(0, 3).map((o) => `${o.name} −${o.n}`).join(", ");
    facts.push(`From your records, stock went down mainly through sales in the last 30 days: ${line}.`);
  }
  if (damaged > 0) facts.push(`Also, ${damaged} unit${damaged !== 1 ? "s" : ""} left through damage or corrections — worth a look if that surprises you.`);
  return facts;
}

function debtsFacts(): string[] {
  const rows = listDebts("receivable");
  if (rows.length === 0) return ["No customers owe you money right now, according to your records."];
  const total = rows.reduce((a, d) => a + d.outstanding.amount_minor, 0);
  const top = [...rows].sort((a, b) => b.outstanding.amount_minor - a.outstanding.amount_minor).slice(0, 3);
  const who = top.map((d) => `${d.counterparty_name} (${d.outstanding.display})`).join(", ");
  const overdue = rows.filter((d) => d.overdue).length;
  const facts = [`From your records: ${rows.length} customer${rows.length !== 1 ? "s" : ""} owe you ${money(total)} in total. The largest: ${who}.`];
  if (overdue > 0) facts.push(`${overdue} of these ${overdue === 1 ? "is" : "are"} past the agreed date — those are the ones to chase first.`);
  return facts;
}

function attention(): string[] {
  const alerts = computeWatch().alerts;
  if (alerts.length === 0) return ["Nothing needs attention right now — Business Watch is clear. A good moment to look at what's selling best and plan stock."];
  const facts = [`Business Watch found ${alerts.length} thing${alerts.length !== 1 ? "s" : ""}:`];
  for (const a of alerts.slice(0, 4)) facts.push(`• ${a.what} ${a.action}`);
  return facts;
}

function compare(): string[] {
  const cur = report("month");
  const prev = report("last_month");
  if (prev.cash.money_in.amount_minor === 0 && prev.cash.money_out.amount_minor === 0) {
    return ["I don't have any records for last month, so there's nothing to compare this month against yet."];
  }
  const facts = [
    `This month so far: money in ${cur.cash.money_in.display}, money out ${cur.cash.money_out.display}, left over ${cur.cash.left_over.display}, ${cur.sales.count} sales.`,
    `Last month: money in ${prev.cash.money_in.display}, money out ${prev.cash.money_out.display}, left over ${prev.cash.left_over.display}, ${prev.sales.count} sales.`,
  ];
  const p = pct(cur.cash.money_in.amount_minor, prev.cash.money_in.amount_minor);
  if (p !== null) facts.push(`Money in is ${p >= 0 ? "+" : ""}${p.toFixed(0)}% versus last month — remember this month isn't finished yet, so the gap will close as days are added.`);
  return facts;
}

export function partnerHistory(): { messages: PartnerMessage[]; provider: string } {
  return { messages: [...messages].slice(-50), provider: "local" };
}

export function partnerAsk(text: string): { owner: PartnerMessage; partner: PartnerMessage } {
  const { intent, product } = route(text);
  let facts: string[];
  switch (intent) {
    case "overview": facts = overview(text); break;
    case "profit_why": facts = profitWhy(); break;
    case "expenses": facts = expenses(); break;
    case "top_products": facts = topProducts(); break;
    case "product": facts = product ? productFacts(product) : [HELP_TEXT]; break;
    case "stock_why": facts = stockWhy(); break;
    case "debts": facts = debtsFacts(); break;
    case "attention": facts = attention(); break;
    case "compare": facts = compare(); break;
    default: facts = [HELP_TEXT];
  }
  const owner: PartnerMessage = { id: mid(), role: "owner", text, intent: null, created_at: new Date().toISOString() };
  const partner: PartnerMessage = { id: mid(), role: "partner", text: facts.join("\n\n"), intent, created_at: new Date().toISOString() };
  messages.push(owner, partner);
  return { owner, partner };
}
