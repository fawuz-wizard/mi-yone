import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { categories } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const kind = req.nextUrl.searchParams.get("kind");
  const rows = kind === "INCOME" || kind === "EXPENSE" ? categories.filter((c) => c.kind === kind) : categories;
  return ok(rows);
}
