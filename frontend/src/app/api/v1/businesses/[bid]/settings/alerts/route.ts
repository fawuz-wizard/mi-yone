// MOCK alert preferences (parity with settings_r).
import { type NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";
import { alertPrefs, updateAlertPrefs } from "@/mocks/store";

export async function GET(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  return ok({ ...alertPrefs });
}

export async function PATCH(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  const body = await req.json();
  return ok(updateAlertPrefs(body));
}
