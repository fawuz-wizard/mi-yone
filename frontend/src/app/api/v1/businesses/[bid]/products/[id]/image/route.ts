// MOCK product image endpoints — in-memory storage (see mocks/store.ts).
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, getProductImage, getProductRow, removeProductImage, setProductImage, toProduct } from "@/mocks/store";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const img = getProductImage(id);
  if (!img) return fail(404, err("NOT_FOUND", "Record not found."));
  return new Response(Buffer.from(img.b64, "base64"), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=86400" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const row = getProductRow(id);
  if (!row) return fail(404, err("NOT_FOUND", "Record not found."));
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !ALLOWED.has(file.type)) {
    return fail(422, err("VALIDATION_ERROR", "That file type isn't supported — use a JPG, PNG, or WebP photo."));
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return fail(422, err("VALIDATION_ERROR", "That photo is too large — keep it under 5 MB."));
  }
  setProductImage(id, Buffer.from(bytes).toString("base64"), file.type);
  return ok(toProduct(row), { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const row = getProductRow(id);
  if (!row) return fail(404, err("NOT_FOUND", "Record not found."));
  removeProductImage(id);
  return ok(toProduct(row));
}
