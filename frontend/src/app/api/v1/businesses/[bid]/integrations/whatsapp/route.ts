// MOCK WhatsApp integration status.
import type { NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { waStatus } from "@/mocks/whatsapp";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(waStatus());
}
