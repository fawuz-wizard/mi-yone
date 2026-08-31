// MOCK /auth/change-password — demo credentials are fixed to demo-password.
import { type NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";

export async function POST(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  const body = await req.json();
  if (body.current_password !== "demo-password") {
    return fail(422, err("VALIDATION_ERROR", "The current password is not correct."));
  }
  if (typeof body.new_password !== "string" || body.new_password.length < 10) {
    return fail(422, err("VALIDATION_ERROR", "The new password is too short."));
  }
  return ok({});
}
