// Settlement ("Mark as paid" / "Pay supplier") — creates the cash transaction and
// updates the debt; over-settlement is rejected (Phase 2 M7 acceptance).
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, settleDebt } from "@/mocks/store";
import type { CreateSettlementInput } from "@/shared/api/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as CreateSettlementInput | null;
  if (!body || typeof body.amount_minor !== "number") {
    return fail(422, err("VALIDATION_ERROR", "The amount is invalid."));
  }
  const result = settleDebt(id, body.amount_minor);
  if (!result) return fail(422, err("VALIDATION_ERROR", "The payment is more than what is owed."));
  return ok(result, { status: 201 });
}
