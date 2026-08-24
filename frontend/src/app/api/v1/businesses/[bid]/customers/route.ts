import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { customers, err } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(customers);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as { name?: string; phone?: string } | null;
  if (!body?.name?.trim()) return fail(422, err("VALIDATION_ERROR", "A name is needed."));
  const customer = { id: `c-${Date.now()}`, name: body.name.trim(), phone: body.phone ?? null };
  customers.push(customer);
  return ok(customer, { status: 201 });
}
