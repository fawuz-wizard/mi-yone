import type { NextRequest } from "next/server";
import { err, transactions } from "@/mocks/store";
import { fail, ok, requireSession } from "@/mocks/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const t = transactions.find((x) => x.id === id);
  if (!t) return fail(404, err("NOT_FOUND", "Record not found."));
  return ok(t);
}
