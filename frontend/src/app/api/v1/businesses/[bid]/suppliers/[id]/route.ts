import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err, partyDetail, updateParty } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const detail = partyDetail("supplier", id);
  if (!detail) return fail(404, err("NOT_FOUND", "Supplier not found."));
  return ok(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(422, err("VALIDATION_ERROR", "Nothing to change."));
  const party = updateParty("supplier", id, body);
  if (!party) return fail(404, err("NOT_FOUND", "Supplier not found."));
  return ok(party);
}
