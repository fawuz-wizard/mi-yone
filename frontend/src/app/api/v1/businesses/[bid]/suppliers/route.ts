import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, listParties, supplierRows } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(listParties("supplier"));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as { name?: string; phone?: string } | null;
  if (!body?.name?.trim()) return fail(422, err("VALIDATION_ERROR", "A name is needed."));
  const row = { id: `s-${Date.now()}`, name: body.name.trim(), phone: body.phone?.trim() || null, notes: null, archived: false };
  supplierRows.push(row);
  return ok(listParties("supplier").find((s) => s.id === row.id), { status: 201 });
}
