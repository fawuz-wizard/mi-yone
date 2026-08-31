// MOCK /auth/sessions — this demo browser session only.
import { type NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";

export async function GET(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  return ok({ sessions: [{ id: "sess-demo-1", created_at: new Date().toISOString(), current: true }] });
}
