import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, getProductRow, productMovementHistory, toProduct, updateProduct } from "@/mocks/store";
import type { UpdateProductInput } from "@/shared/api/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const row = getProductRow(id);
  if (!row) return fail(404, err("NOT_FOUND", "Product not found."));
  return ok({ product: toProduct(row), movements: productMovementHistory(id).slice(0, 30) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateProductInput | null;
  if (!body) return fail(422, err("VALIDATION_ERROR", "Nothing to change."));
  const product = updateProduct(id, body);
  if (!product) return fail(404, err("NOT_FOUND", "Product not found."));
  return ok(product);
}
