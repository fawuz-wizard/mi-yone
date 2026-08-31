// MOCK — single demo session, nothing else to sign out.
import { type NextRequest } from "next/server";
import { ok, requireSession } from "@/mocks/http";

export async function POST(req: NextRequest) {
  const guard = requireSession(req);
  if (guard) return guard;
  return ok({ signed_out: 0 });
}
