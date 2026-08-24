// Add stock = PURCHASE movement + expense + optional supplier payable, one action.
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { addStock, err } from "@/mocks/store";
import type { AddStockInput } from "@/shared/api/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as AddStockInput | null;
  if (!body || typeof body.quantity !== "number" || body.quantity <= 0) {
    return fail(422, err("VALIDATION_ERROR", "The quantity is invalid."));
  }
  const result = addStock(id, body);
  if (!result) return fail(422, err("VALIDATION_ERROR", "This stock entry could not be recorded."));
  return ok(result, { status: 201 });
}
