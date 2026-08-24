import type { NextRequest } from "next/server";
import { err } from "@/mocks/store";
import { fail, ok, requireSession } from "@/mocks/http";
import { createTransaction, visibleTransactions } from "@/mocks/store";
import type { CreateTransactionInput } from "@/shared/api/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const category = sp.get("category"); // category name (server filter)
  const from = sp.get("from"); // ISO date, inclusive (business date)
  const to = sp.get("to"); // ISO date, inclusive
  let rows = visibleTransactions();
  if (type === "INCOME" || type === "EXPENSE") rows = rows.filter((t) => t.type === type);
  if (category) rows = rows.filter((t) => t.category_name === category);
  if (from) rows = rows.filter((t) => t.occurred_at.slice(0, 10) >= from);
  if (to) rows = rows.filter((t) => t.occurred_at.slice(0, 10) <= to);
  rows = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return ok(rows.slice(0, 100));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as CreateTransactionInput | null;
  if (!body || typeof body.amount_minor !== "number" || body.amount_minor <= 0) {
    return fail(422, err("VALIDATION_ERROR", "The amount is invalid."));
  }
  if (body.amount_minor > 100_000_000_000) {
    return fail(422, err("VALIDATION_ERROR", "The amount is larger than expected."));
  }
  const key = req.headers.get("Idempotency-Key");
  const { transaction, replay } = createTransaction(body, key);
  return ok(transaction, { status: replay ? 200 : 201 });
}
