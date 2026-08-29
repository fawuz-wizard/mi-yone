// MOCK auth — demo build only. The demo owner's credentials sign in to the
// example business; anything else fails like the real backend (uniform 401).
// Real backend: server-side opaque sessions per Phase 2 §17 (owner-approved).
import { NextResponse, type NextRequest } from "next/server";
import { fail, ok, SESSION_COOKIE } from "@/mocks/http";
import { business, err, MOCK_USER } from "@/mocks/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { identifier?: string; password?: string };
  const identifier = (body.identifier ?? "").trim().toLowerCase();
  if (identifier !== "mariama@example.sl" || body.password !== "demo-password") {
    return fail(401, err("AUTH_INVALID", "We couldn't sign you in. Check your details and try again."));
  }
  const res = ok({ user: { name: MOCK_USER }, business }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "mock-session-token", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
