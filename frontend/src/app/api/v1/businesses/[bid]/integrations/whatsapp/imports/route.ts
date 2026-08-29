import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { waRunImport } from "@/mocks/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const imp = waRunImport();
  if (!imp) return fail(422, err("VALIDATION_ERROR", "Connect the WhatsApp catalog first."));
  return ok(imp, { status: 201 });
}
