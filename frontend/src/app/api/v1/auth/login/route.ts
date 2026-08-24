// MOCK auth — demo build only. Any credentials sign in to the example business.
// Real backend: server-side opaque sessions per Phase 2 §17 (owner-approved).
import { NextResponse, type NextRequest } from "next/server";
import { ok, SESSION_COOKIE } from "@/mocks/http";
import { business, MOCK_USER } from "@/mocks/store";

export async function POST(req: NextRequest) {
  await req.json().catch(() => ({}));
  const res = ok({ user: { name: MOCK_USER }, business }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "mock-session-token", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
