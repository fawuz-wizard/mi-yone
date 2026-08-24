import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { listDebts } from "@/mocks/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(listDebts("receivable"));
}
