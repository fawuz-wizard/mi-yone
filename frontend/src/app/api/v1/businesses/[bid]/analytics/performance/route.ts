import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { performance } from "@/mocks/store";
import type { PerfRange } from "@/shared/api/types";

const RANGES: PerfRange[] = ["7d", "30d", "3m", "6m", "1y"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const raw = req.nextUrl.searchParams.get("range") ?? "30d";
  const range = (RANGES.includes(raw as PerfRange) ? raw : "30d") as PerfRange;
  return ok(performance(range));
}
