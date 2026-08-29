// MOCK register — demo build only. The mock store is single-tenant, so a new
// account signs into the EXAMPLE business (clearly a mock behavior; the real
// backend creates a fresh empty business with seeded categories per Phase 2).
// The demo owner's email is treated as "already taken" for error-state parity.
import { NextResponse, type NextRequest } from "next/server";
import { fail, ok, SESSION_COOKIE } from "@/mocks/http";
import { business, err } from "@/mocks/store";

interface RegisterBody {
  name?: string;
  identifier?: string;
  password?: string;
  business_name?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RegisterBody;
  const identifier = (body.identifier ?? "").trim().toLowerCase();
  if (!body.name?.trim() || identifier.length < 3 || (body.password ?? "").length < 10 || identifier === "mariama@example.sl") {
    return fail(422, err("VALIDATION_ERROR", "Some of the information is invalid."));
  }
  const res = ok({ user: { name: body.name.trim() }, business }, { status: 201 }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "mock-session-token", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
