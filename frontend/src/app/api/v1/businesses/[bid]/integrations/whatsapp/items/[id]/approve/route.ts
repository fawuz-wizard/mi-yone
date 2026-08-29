import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, getProductRow, toProduct } from "@/mocks/store";
import { waApprove } from "@/mocks/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, number | string | undefined>;
  const result = waApprove(id, body as never);
  if (result.error) return fail(result.error.status, err(result.error.code, result.error.message));
  const row = getProductRow(result.productId);
  return ok({ item: result.item, product: row ? toProduct(row) : null }, { status: 201 });
}
