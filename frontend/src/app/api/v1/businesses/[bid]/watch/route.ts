// MOCK Business Watch endpoint — alerts derived live from the mock's data.
import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { computeWatch } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(computeWatch());
}
