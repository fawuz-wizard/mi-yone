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
import type { PartnerBlock, PartnerSource, Product } from "@/shared/api/types";
import playbookPack from "./playbook.json";
import langPack from "./lang.json";

export interface PartnerMessage {
  id: string;
  role: "owner" | "partner";
  text: string;
  intent: string | null;
  mode: "business" | "advice" | "research";
  blocks: PartnerBlock[];
  created_at: string;
}

// MOCK parity with backend app/advice + app/research. The guidance pack is a
// COPY of backend/app/advice/playbook.json — partner.playbook.test.ts fails if
// the two ever drift, so there is one source of advisory truth.
type PlaybookTopic = { title: string; practices: string[]; watch_out?: string };
const TOPICS = playbookPack.topics as unknown as Record<string, PlaybookTopic>;

const TOPIC_KEYWORDS: [string, string[]][] = [
  ["debt_collection", ["owe", "owes", "owed", "debt", "debts", "collect", "chase"]],
  ["pricing", ["price", "prices", "pricing", "charge", "expensive", "cheap"]],
  ["whatsapp_marketing", ["whatsapp", "advertise", "advertising", "marketing", "promote", "promotion", "status"]],
  ["stock_management", ["stock", "restock", "inventory", "shelf", "supply", "spoil"]],
  ["reduce_expenses", ["reduce", "cut", "lower", "save", "expenses", "expense", "cost", "costs", "spending"]],
  ["attract_customers", ["attract", "bring", "customers", "customer", "people", "market"]],
  ["customer_retention", ["keep", "retain", "loyal", "return", "returning", "again"]],
  ["new_products", ["add", "new", "product", "products", "line", "stocking"]],
  ["cash_flow", ["cash", "flow", "afford", "borrow"]],
  ["record_keeping", ["record", "records", "book", "books", "track", "keeping"]],
  ["growth", ["grow", "growth", "expand", "expansion", "bigger", "plan", "planning", "strategy", "future"]],
  ["increase_sales", ["increase", "boost", "improve", "sales", "sell", "selling"]],
];
const DOMINANT_KEYWORDS: Record<string, string> = {
  whatsapp: "whatsapp_marketing", price: "pricing", prices: "pricing", pricing: "pricing",
  restock: "stock_management", credit: "debt_collection", spoil: "stock_management",
};
const ADVICE_TRIGGERS = [
  "advice", "advise", "suggest", "suggestion", "idea", "ideas", "tip", "tips",
  "strategy", "recommend", "help me", "should i do", "can i do", "i can do",
  "how can i", "how i can", "how do i", "how to", "what do successful",
  "best practice", "best practices", "what works", "i will market",
  "market my", "grow my", "improve my", "better my", "attract",
];
const RESEARCH_TRIGGERS = [
  "research", "look up", "search for", "market price", "market prices",
  "going rate", "people buying", "people buy", "customers buying",
  "what is the price of", "current price", "market trend", "market trends",
  "competitor", "competitors", "industry", "trending", "in demand",
  "businesses doing", "shops doing", "businesses are doing", "other shops",
];
const DECISION_VERBS = ["buy", "restock", "stock", "increase", "raise", "reduce", "lower", "drop", "add", "sell", "expand", "open", "borrow", "hire", "invest", "order"];

const SITUATION_OF: Record<string, string> = {
  reduce_expenses: "expenses", cash_flow: "expenses", debt_collection: "debts",
  stock_management: "stock_why", new_products: "top_products", pricing: "top_products",
};

// MOCK parity with backend research/provider.py: no provider is configured in
// the mock, so research is honestly unavailable — it never invents a market.
const RESEARCH_AVAILABLE = false;
const UNAVAILABLE_TEXT =
  "I can't verify that information right now — market research isn't switched on for this business yet, " +
  "and I won't guess at prices or market facts. What I can do is answer from your own records, or give " +
  "you general business guidance.";

export { normalizeQ };

export function matchTopic(normalized: string, fallback = "increase_sales"): string {
  const words = new Set(normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  for (const [word, topic] of Object.entries(DOMINANT_KEYWORDS)) if (words.has(word)) return topic;
  let best = fallback;
  let bestScore = 0;
  for (const [topic, keys] of TOPIC_KEYWORDS) {
    const score = keys.filter((k) => words.has(k)).length;
    if (score > bestScore) { best = topic; bestScore = score; }
  }
  return best;
}

export function renderGuidance(topic: string): string {
  const t = TOPICS[topic];
  const lines = [`${t.title}:`, ...t.practices.map((p) => `• ${p}`)];
  if (t.watch_out) lines.push(`Worth remembering: ${t.watch_out}`);
  return lines.join("\n");
}

function routeMode(normalized: string, words: Set<string>): "research" | "decision" | "advice" | null {
  if (RESEARCH_TRIGGERS.some((t) => normalized.includes(t))) return "research";
  if (words.has("should") && DECISION_VERBS.some((v) => words.has(v)) && !["focus", "attention", "worry"].some((w) => words.has(w)))
    return "decision";
  if (ADVICE_TRIGGERS.some((t) => normalized.includes(t))) return "advice";
  return null;
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

// MOCK parity with backend evidence._product_tokens: "50kg" and "5l" identify
// a product and are kept; a bare number is a price or a quantity.
function productTokens(p: Product): Set<string> {
  return new Set(tokens(p.name).filter((t) => t.length >= 2 && !/^\d+$/.test(t)));
}

/** MOCK parity with backend evidence._match_product. A tie goes to the product
 *  the question covers most completely — one word out of one beats one out of
 *  three — so "QA Rice" is not answered with "Rice (50kg bag)". */
function bestProduct(words: Set<string>, list: Product[]): Product | null {
  let matched: Product | null = null;
  let best: [number, number, number] = [0, 0, -1e9];
  for (const p of list) {
    const toks = [...productTokens(p)];
    if (toks.length === 0) continue;
    const hits = toks.filter((t) => words.has(t)).length;
    if (hits === 0) continue;
    const score: [number, number, number] = [hits, hits / toks.length, -p.name.length];
    if (score[0] > best[0] || (score[0] === best[0] && (score[1] > best[1] || (score[1] === best[1] && score[2] > best[2])))) {
      best = score;
      matched = p;
    }
  }
  return matched;
}


// MOCK parity with backend ai/lang.py — Krio/business normalization applied
// before routing so English, Krio, and mixed questions route identically.
// lang.json is a COPY of backend/app/ai/lang.json; partner.playbook.test.ts
// fails the build if they drift, so there is one vocabulary, not two.
const PHRASE_MAP: [string, string][] = Object.entries(langPack.phrases as Record<string, string>);
const TOKEN_MAP: Record<string, string> = langPack.tokens as Record<string, string>;

function normalizeQ(text: string): string {
  let t = " " + text.toLowerCase().trim() + " ";
  for (const [phrase, repl] of [...PHRASE_MAP].sort((x, y) => y[0].length - x[0].length)) {
    t = t.split(" " + phrase + " ").join(" " + repl + " ").split(" " + phrase + "?").join(" " + repl + "?");
  }
  const words = t.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
  return words.map((w) => (w in TOKEN_MAP ? TOKEN_MAP[w] : w)).filter(Boolean).join(" ");
}

function route(question: string): { intent: string; product: Product | null } {
  const q = normalizeQ(question);
  const words = new Set(tokens(q));
  const has = (...ws: string[]) => ws.some((w) => words.has(w));

  const matched = bestProduct(words, listProducts(false));
  if (has("attention", "focus", "worry", "watch", "problem", "problems")) return { intent: "attention", product: null };
  if (matched) return { intent: "product", product: matched };
  if (words.has("compare") || q.includes("last month") || q.includes(" vs ")) return { intent: "compare", product: null };
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

let lastContext: { intent: string | null; product: Product | null } = { intent: null, product: null };

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
    `From your records ${label}: money in ${r.cash.money_in.display}, money out ${r.cash.money_out.display}, left over ${r.cash.left_over.display}, across ${r.sales.count} sale${r.sales.count !== 1 ? "s" : ""}.`,
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
  const tops = r.sales.top_products.slice(0, 3);
  const lines = tops.map((p) => `${p.name} (${p.units} sold, ${p.revenue_estimate.display})`).join(", ");
  const facts = [`From your records this month, your top products are: ${lines}.`];
  if (tops.some((p) => p.revenue_exact === false)) {
    facts.push(
      "Some of those sales were recorded as a bundled total with no per-item price, so part of the figure uses the current price.",
    );
  }
  return facts;
}

function productFacts(p: Product): string[] {
  const now = Date.now();
  const monthStart = now - 30 * 86400000;
  const at = (iso: string) => new Date(iso).getTime();
  const moves = productMovements(p.id);
  const saleMoves = moves.filter((m) => m.type === "SALE" && at(m.occurred_at) >= monthStart);
  const sold = saleMoves.reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
  const facts: string[] = [];
  const plural = (n: number) => (n !== 1 && !p.unit.endsWith("s") ? "s" : "");
  if (sold === 0) {
    facts.push(`I don't have any recorded sales of ${p.name} in the last 30 days.`);
  } else {
    // The price each sale was ACTUALLY made at (MOCK parity with backend
    // analytics.product_revenue) — today's price never rewrites history.
    let revenue = 0;
    let exact = true;
    for (const m of saleMoves) {
      const qty = Math.abs(m.quantity_delta);
      if (m.unit_cost !== null) revenue += qty * m.unit_cost.amount_minor;
      else {
        revenue += qty * p.selling_price.amount_minor;
        exact = false;
      }
    }
    let line = `From your records: ${sold} ${p.unit}${plural(sold)} of ${p.name} sold in the last 30 days, bringing in ${money(revenue)}.`;
    if (!exact) line += " Some of those were recorded as a bundled total, so part of that figure uses the current price.";
    facts.push(line);
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

function recordsAnswer(text: string): { intent: string; product: Product | null; facts: string[] } {
  let { intent, product } = route(text);
  // MOCK parity with backend resolve_context (§11): short follow-ups inherit
  // the previous answer's subject.
  const words = new Set(normalizeQ(text).split(" "));
  const short = words.size <= 6;
  const whyish = [...words].every((w) => ["why", "how", "come", "it", "that", "this", "so", "u", "say", "dat"].includes(w));
  if (product === null && short) {
    if (words.size > 0 && whyish) {
      if (lastContext.product) { intent = "product"; product = lastContext.product; }
      else if (["overview", "compare", "profit_why", "product"].includes(lastContext.intent ?? "")) intent = "profit_why";
    } else if ((words.has("it") || words.has("that")) && lastContext.product) {
      intent = "product"; product = lastContext.product;
    } else if (intent === "help" && lastContext.product) {
      intent = "product"; product = lastContext.product;
    }
  }
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
  return { intent, product, facts };
}

export function partnerHistory(): { messages: PartnerMessage[]; provider: string; research_available: boolean } {
  return { messages: [...messages].slice(-50), provider: "local", research_available: RESEARCH_AVAILABLE };
}

const block = (source: PartnerSource, text: string): PartnerBlock => ({ source, text });

function situationBlocks(normalized: string, topic: string, product: Product | null): PartnerBlock[] {
  if (product) return productFacts(product).map((f) => block("records", f));
  let facts: string[];
  if (normalized.includes("compare") || normalized.includes("last month")) facts = compare();
  else
    switch (SITUATION_OF[topic]) {
      case "expenses": facts = expenses(); break;
      case "debts": facts = debtsFacts(); break;
      case "stock_why": facts = stockWhy(); break;
      case "top_products": facts = topProducts(); break;
      default: facts = overview(normalized);
    }
  return facts.map((f) => block("records", f));
}

function adviceBlocks(normalized: string, product: Product | null): PartnerBlock[] {
  const topic = matchTopic(normalized);
  return [
    ...situationBlocks(normalized, topic, product),
    block("guidance", renderGuidance(topic)),
    block("note", "If you want current market information on this, ask me to research it — I'll show you where it came from."),
  ];
}

function decisionBlocks(normalized: string, product: Product | null): PartnerBlock[] {
  const topic = matchTopic(normalized, "stock_management");
  const blocks = situationBlocks(normalized, topic, product);
  if (product && product.track_inventory) {
    const now = Date.now();
    const at = (iso: string) => new Date(iso).getTime();
    const moves = productMovements(product.id).filter((m) => m.type === "SALE");
    const sold = moves.filter((m) => at(m.occurred_at) >= now - 30 * 86400000).reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
    const prev = moves
      .filter((m) => at(m.occurred_at) >= now - 60 * 86400000 && at(m.occurred_at) < now - 30 * 86400000)
      .reduce((a, m) => a + Math.abs(m.quantity_delta), 0);
    const low = product.stock <= product.low_stock_threshold;
    let weigh: string;
    if (low && sold > 0) {
      weigh = `Weighing it up: ${product.name} is at or below your low-stock level and it has been selling, so running out is a real risk. Against that, restocking ties up cash — check what you owe suppliers this week before you commit.`;
    } else if (!low && prev > sold) {
      weigh = `Weighing it up: you still have ${product.stock} ${product.unit} and it sold slower than the month before, so there's no urgency in your records. Money spent here is money not available for what is moving.`;
    } else {
      weigh = "Weighing it up: your records don't show an urgent shortage. The question is whether the cash is better used here or on what is selling faster right now — that part is your call.";
    }
    blocks.push(block("records", weigh));
  } else {
    blocks.push(block("records", "I can only weigh this against what your records actually show. If the figures above don't cover the decision, tell me what else you're comparing and I'll look at that too."));
  }
  blocks.push(block("guidance", renderGuidance(topic)));
  return blocks;
}

function researchBlocks(normalized: string): PartnerBlock[] {
  const blocks: PartnerBlock[] = [];
  if (["my business", "my shop", "compare", "my sales"].some((n) => normalized.includes(n))) {
    blocks.push(...overview(normalized).map((f) => block("records", f)));
  }
  if (!RESEARCH_AVAILABLE && blocks.length === 0 && ["buy", "buying", "sell", "selling", "product", "products", "move", "moving"].some((n) => normalized.includes(n))) {
    blocks.push(block("records", "I can't tell you what the wider market is buying, but I can tell you what is moving in your own shop:"));
    blocks.push(...topProducts().map((f) => block("records", f)));
  }
  blocks.push(block("note", UNAVAILABLE_TEXT));
  return blocks;
}

export function partnerAsk(text: string, mode: "auto" | "business" | "research" = "auto"): { owner: PartnerMessage; partner: PartnerMessage } {
  const asked = mode === "research" ? `research ${text}` : text;
  const normalized = normalizeQ(asked);
  const words = new Set(normalized.split(" ").filter(Boolean));
  const lane = routeMode(normalized, words);

  let answerMode: PartnerMessage["mode"] = "business";
  let intent: string;
  let product: Product | null = null;
  let blocks: PartnerBlock[];

  if (lane === "research") {
    answerMode = "research";
    intent = "research";
    blocks = researchBlocks(normalized);
  } else if (lane === "advice" || lane === "decision") {
    answerMode = "advice";
    let matched = bestProduct(words, listProducts(false));
    if (!matched) matched = lastContext.product;
    product = matched;
    intent = lane === "decision" ? "decision" : "advice";
    blocks = lane === "decision" ? decisionBlocks(normalized, matched) : adviceBlocks(normalized, matched);
  } else {
    const routed = recordsAnswer(asked);
    intent = routed.intent;
    product = routed.product;
    blocks = routed.facts.map((f) => block("records", f));
  }

  lastContext = { intent, product };
  const owner: PartnerMessage = { id: mid(), role: "owner", text, intent: null, mode: answerMode, blocks: [], created_at: new Date().toISOString() };
  const partner: PartnerMessage = {
    id: mid(), role: "partner", text: blocks.map((b) => b.text).join("\n\n"),
    intent, mode: answerMode, blocks, created_at: new Date().toISOString(),
  };
  messages.push(owner, partner);
  return { owner, partner };
}
