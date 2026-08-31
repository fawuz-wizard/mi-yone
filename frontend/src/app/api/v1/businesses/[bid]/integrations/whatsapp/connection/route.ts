// MOCK WhatsApp disconnect (parity with settings_r).
import { type NextRequest } from "next/server";
import { fail, ok, requireSession } from "@/mocks/http";
import { err } from "@/mocks/store";
import { disconnect } from "@/mocks/whatsapp";

export async function DELETE(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  if (!disconnect()) return fail(404, err("NOT_FOUND", "Record not found."));
  return ok({});
}
