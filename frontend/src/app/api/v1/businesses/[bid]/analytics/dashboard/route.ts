import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { dashboard } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const period = (req.nextUrl.searchParams.get("period") ?? "today") as "today" | "week" | "month";
  return ok(dashboard(period));
}
