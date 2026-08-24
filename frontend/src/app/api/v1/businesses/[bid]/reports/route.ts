import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { report } from "@/mocks/store";
import type { ReportPeriod } from "@/shared/api/types";

const PERIODS: ReportPeriod[] = ["today", "week", "month", "last_month"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const raw = req.nextUrl.searchParams.get("period") ?? "month";
  const period = (PERIODS.includes(raw as ReportPeriod) ? raw : "month") as ReportPeriod;
  return ok(report(period));
}
