import type { NextRequest } from "next/server";
import { err } from "@/mocks/store";
import { fail, ok, requireSession } from "@/mocks/http";
import { createTransaction, visibleTransactions } from "@/mocks/store";
import type { CreateTransactionInput } from "@/shared/api/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const type = req.nextUrl.searchParams.get("type");
  let rows = visibleTransactions();
  if (type === "INCOME" || type === "EXPENSE") rows = rows.filter((t) => t.type === type);
  rows = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return ok(rows.slice(0, 50));
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
