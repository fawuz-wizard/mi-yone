// MOCK photo suggestions — parity with the credential-less real backend:
// no AI provider configured → available:false, honestly. Nothing is faked.
import type { NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !ALLOWED.has(file.type)) {
    return fail(422, err("VALIDATION_ERROR", "That file type isn't supported — use a JPG, PNG, or WebP photo."));
  }
  return ok({ available: false, name: null, category: null, description: null });
}
