import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { waSkip } from "@/mocks/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const result = waSkip(id);
  if (result.error) return fail(result.error.status, err(result.error.code, result.error.message));
  return ok(result.item);
}
