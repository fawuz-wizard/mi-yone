// CSV export — generated SERVER-SIDE from the ledgers (the client never
// assembles financial truth). Download as attachment.
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/mocks/http";
import { reportCsv } from "@/mocks/store";
import type { ReportPeriod } from "@/shared/api/types";

const PERIODS: ReportPeriod[] = ["today", "week", "month", "last_month"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const raw = req.nextUrl.searchParams.get("period") ?? "month";
  const period = (PERIODS.includes(raw as ReportPeriod) ? raw : "month") as ReportPeriod;
  const csv = reportCsv(period);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mi-yone-report-${period}.csv"`,
    },
  });
}
