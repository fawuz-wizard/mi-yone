// Correction endpoint: one client-facing "fix" = reversal + corrected record on the
// ledger (Phase 2 §8). The mock mirrors the service-level "correct" operation.
import type { NextRequest } from "next/server";
import { err, fixTransaction } from "@/mocks/store";
import { fail, ok, requireSession } from "@/mocks/http";
import type { FixTransactionInput } from "@/shared/api/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as FixTransactionInput | null;
  if (!body) return fail(422, err("VALIDATION_ERROR", "The correction is invalid."));
  if (body.amount_minor !== undefined && (typeof body.amount_minor !== "number" || body.amount_minor <= 0)) {
    return fail(422, err("VALIDATION_ERROR", "The corrected amount is invalid."));
  }
  const corrected = fixTransaction(id, body);
  if (!corrected) return fail(409, err("CONFLICT", "This record was already fixed."));
  return ok(corrected);
}
