// MOCK: remove a debt record. A receivable from a credit sale has no cash row,
// so this is the only door to that sale — it removes the whole sale.
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, reverseDebt } from "@/mocks/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id: debtId } = await params;
  const result = reverseDebt(debtId);
  if (!result.ok) {
    if (result.reason === "purchase") {
      return fail(422, err("VALIDATION_ERROR", "This is part of a stock purchase. Record a stock correction instead."));
    }
    return fail(404, err("NOT_FOUND", "Record not found."));
  }
  return ok({ reversed: true });
}
