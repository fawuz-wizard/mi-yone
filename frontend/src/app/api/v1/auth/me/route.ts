// MOCK /auth/me — profile read + update (single demo user).
import { type NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { meJson, updateProfile } from "@/mocks/store";

export async function GET(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  return ok(meJson());
}

export async function PATCH(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  const body = await req.json();
  if (body.email !== undefined && typeof body.email === "string" && body.email.trim() && !body.email.includes("@")) {
    return fail(422, err("VALIDATION_ERROR", "That email can't be used."));
  }
  return ok(updateProfile(body));
}
