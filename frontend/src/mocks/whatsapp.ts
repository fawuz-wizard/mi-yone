// MOCK WhatsApp catalog integration — parity with the backend TEST adapter.
// There is NO live WhatsApp connection here; this is the labeled sample
// catalog that lets the import→review→approve flow run end to end.
import { createProduct, formatMoney, listProducts } from "./store";
import type { Money } from "@/shared/api/types";

export interface WaItem {
  id: string;
  name: string;
  description: string | null;
  price: Money | null;
  image_url: string | null;
  category: string | null;
  sku: string | null;
  availability: string | null;
  status: "NEEDS_REVIEW" | "APPROVED" | "SKIPPED";
  duplicate_of_product_id: string | null;
  duplicate_name: string | null;
  product_id: string | null;
}

export interface WaImport {
  id: string;
  status: "IMPORTING" | "IMPORTED" | "FAILED";
  error: string | null;
  created_at: string;
  items: WaItem[];
  needs_review: number;
}

interface WaState {
  connection: { id: string; status: "CONNECTED"; mode: "test" } | null;
  latest: WaImport | null;
}

const state: WaState = { connection: null, latest: null };
let seq = 0;
const wid = (p: string) => `${p}-mock-${(seq += 1)}`;

const SAMPLE = [
  { name: "Rice 50kg", description: "Imported long-grain rice, 50kg bag", price_minor: 90_000_00, category: "Food", sku: "WA-RICE-50", availability: "in stock", image_url: null },
  { name: "Palm oil (1L)", description: "Locally produced red palm oil", price_minor: 25_000_00, category: "Cooking", sku: "WA-PALM-1L", availability: "in stock", image_url: "https://example.invalid/palm-oil.jpg" },
  { name: "Maggi cubes (pack)", description: "Seasoning cubes, pack of 60", price_minor: null, category: "Cooking", sku: "WA-MAGGI-60", availability: "in stock", image_url: null },
  { name: "Peak milk (tin)", description: null, price_minor: 12_000_00, category: "Food", sku: "WA-PEAK-TIN", availability: "in stock", image_url: "https://example.invalid/peak.jpg" },
  { name: "Lux soap", description: "Bath soap bar", price_minor: 2_000_00, category: "Household", sku: "WA-LUX", availability: "in stock", image_url: null },
];

const UNIT_WORDS = new Set(["bag", "bags", "piece", "pieces", "kg", "kilo", "cup", "packet", "bottle", "carton", "bar", "bars", "tin", "tins", "box", "pack", "pair", "litre", "liter"]);

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d/.test(w) && !UNIT_WORDS.has(w)),
  );
}

function recount(imp: WaImport): WaImport {
  imp.needs_review = imp.items.filter((i) => i.status === "NEEDS_REVIEW").length;
  return imp;
}

export function waStatus() {
  return { mode: "test", connection: state.connection, latest_import: state.latest ? recount(state.latest) : null };
}

export function waConnect() {
  if (!state.connection) state.connection = { id: wid("wac"), status: "CONNECTED", mode: "test" };
  return state.connection;
}

export function waRunImport(): WaImport | null {
  if (!state.connection) return null;
  const products = listProducts(true);
  const items: WaItem[] = SAMPLE.map((s) => {
    const tokens = nameTokens(s.name);
    const dup = products.find((p) => [...nameTokens(p.name)].some((t) => tokens.has(t))) ?? null;
    return {
      id: wid("wait"),
      name: s.name,
      description: s.description,
      price: s.price_minor !== null ? formatMoney(s.price_minor) : null,
      image_url: s.image_url,
      category: s.category,
      sku: s.sku,
      availability: s.availability,
      status: "NEEDS_REVIEW",
      duplicate_of_product_id: dup?.id ?? null,
      duplicate_name: dup?.name ?? null,
      product_id: null,
    };
  });
  state.latest = recount({ id: wid("waimp"), status: "IMPORTED", error: null, created_at: new Date().toISOString(), items, needs_review: 0 });
  return state.latest;
}

export function waApprove(
  itemId: string,
  payload: { selling_price_minor?: number; cost_price_minor?: number; initial_stock?: number; unit?: string },
): { error?: { status: number; code: "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND"; message: string }; item?: WaItem; productId?: string } {
  const item = state.latest?.items.find((i) => i.id === itemId);
  if (!item) return { error: { status: 404, code: "NOT_FOUND", message: "Record not found." } };
  if (item.status !== "NEEDS_REVIEW") return { error: { status: 409, code: "CONFLICT", message: "This item was already reviewed." } };
  const price = payload.selling_price_minor ?? item.price?.amount_minor ?? null;
  if (price === null || price <= 0) {
    return { error: { status: 422, code: "VALIDATION_ERROR", message: "This item has no price — set a selling price to add it." } };
  }
  const product = createProduct({
    name: item.name,
    unit: payload.unit || "piece",
    selling_price_minor: price,
    cost_price_minor: payload.cost_price_minor ?? 0,
    initial_stock: payload.initial_stock ?? 0,
    origin: "whatsapp",
  });
  item.status = "APPROVED";
  item.product_id = product.id;
  if (state.latest) recount(state.latest);
  return { item, productId: product.id };
}

export function waSkip(itemId: string): { error?: { status: number; code: "CONFLICT" | "NOT_FOUND"; message: string }; item?: WaItem } {
  const item = state.latest?.items.find((i) => i.id === itemId);
  if (!item) return { error: { status: 404, code: "NOT_FOUND", message: "Record not found." } };
  if (item.status !== "NEEDS_REVIEW") return { error: { status: 409, code: "CONFLICT", message: "This item was already reviewed." } };
  item.status = "SKIPPED";
  if (state.latest) recount(state.latest);
  return { item };
}

// MOCK: disconnect — the connection goes, products and history stay.
export function disconnect(): boolean {
  if (!state.connection) return false;
  state.connection = null;
  return true;
}
