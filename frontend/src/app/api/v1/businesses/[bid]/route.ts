// MOCK PATCH /businesses/{bid} — business name update (parity with settings_r).
import { type NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { updateBusinessName } from "@/mocks/store";

export async function PATCH(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  const body = await req.json();
  if (typeof body.name !== "string" || !body.name.trim()) {
    return fail(422, err("VALIDATION_ERROR", "A name is needed."));
  }
  return ok(updateBusinessName(body.name));
}
