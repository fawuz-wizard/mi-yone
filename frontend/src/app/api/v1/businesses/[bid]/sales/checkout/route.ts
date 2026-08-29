// MOCK scan-to-sell checkout — server-side totals + stock validation (parity
// with trade.checkout; client totals are never trusted).
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { checkout, err } from "@/mocks/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as { items?: { product_id?: string; quantity?: number }[] } | null;
  const key = req.headers.get("Idempotency-Key");
  const outcome = checkout(body?.items ?? [], key);
  if ("error" in outcome) return fail(422, err("VALIDATION_ERROR", outcome.error));
  return ok(outcome.result, { status: outcome.replay ? 200 : 201 });
}
