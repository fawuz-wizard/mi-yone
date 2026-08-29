// MOCK progression/regression trends endpoint.
import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { computeTrends } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(computeTrends(req.nextUrl.searchParams.get("range") ?? "30d"));
}
