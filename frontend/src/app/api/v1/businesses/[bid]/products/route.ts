import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { createProduct, err, listProducts } from "@/mocks/store";
import type { CreateProductInput } from "@/shared/api/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(listProducts());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as CreateProductInput | null;
  if (!body?.name?.trim() || typeof body.selling_price_minor !== "number" || body.selling_price_minor <= 0) {
    return fail(422, err("VALIDATION_ERROR", "A name and selling price are needed."));
  }
  return ok(createProduct(body), { status: 201 });
}
