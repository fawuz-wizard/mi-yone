import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { addManualDebt, err, listDebts } from "@/mocks/store";
import type { CreateDebtInput } from "@/shared/api/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(listDebts("payable"));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as CreateDebtInput | null;
  if (!body || typeof body.amount_minor !== "number") {
    return fail(422, err("VALIDATION_ERROR", "The amount is invalid."));
  }
  const debt = addManualDebt("payable", body);
  if (!debt) return fail(422, err("VALIDATION_ERROR", "This debt could not be recorded."));
  return ok(debt, { status: 201 });
}
