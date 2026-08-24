// MOCK sales endpoint — one sale = cash transaction + optional receivable + stock
// decrement, atomically (Phase 2 §M6 orchestration shape).
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { createSale, err } from "@/mocks/store";
import type { CreateSaleInput } from "@/shared/api/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as CreateSaleInput | null;
  if (!body || typeof body.amount_minor !== "number" || body.amount_minor <= 0) {
    return fail(422, err("VALIDATION_ERROR", "The amount is invalid."));
  }
  const key = req.headers.get("Idempotency-Key");
  const outcome = createSale(body, key);
  if (!outcome) return fail(422, err("VALIDATION_ERROR", "This sale could not be recorded."));
  return ok(outcome.result, { status: outcome.replay ? 200 : 201 });
}
