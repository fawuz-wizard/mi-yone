import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { waConnect } from "@/mocks/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(waConnect(), { status: 201 });
}
