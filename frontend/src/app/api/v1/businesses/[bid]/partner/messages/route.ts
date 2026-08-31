// MOCK Partner endpoints — deterministic grounded answers (see mocks/partner.ts).
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { partnerAsk, partnerHistory } from "@/mocks/partner";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  return ok(partnerHistory());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const body = (await req.json().catch(() => null)) as { text?: string; mode?: string } | null;
  const text = (body?.text ?? "").trim();
  if (!text || text.length > 500) return fail(422, err("VALIDATION_ERROR", "Ask me something about your business."));
  const mode = body?.mode ?? "auto";
  if (!["auto", "business", "research"].includes(mode)) return fail(422, err("VALIDATION_ERROR", "Unknown mode."));
  return ok(partnerAsk(text, mode as "auto" | "business" | "research"), { status: 201 });
}
