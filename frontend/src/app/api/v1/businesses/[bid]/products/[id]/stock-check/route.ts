// Stock check: the owner states reality; the server computes the adjustment.
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, stockCheck } from "@/mocks/store";
import type { StockCheckInput } from "@/shared/api/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as StockCheckInput | null;
  if (!body || typeof body.counted !== "number" || body.counted < 0 || !body.reason) {
    return fail(422, err("VALIDATION_ERROR", "The count is invalid."));
  }
  const result = stockCheck(id, body);
  if (!result) return fail(422, err("VALIDATION_ERROR", "This stock check could not be recorded."));
  return ok(result, { status: 201 });
}
