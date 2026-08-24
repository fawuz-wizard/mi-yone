// MOCK route-handler helpers: envelope + auth guard (cookie check).
import { NextResponse, type NextRequest } from "next/server";
import { err } from "./store";
import type { ApiErrorBody } from "@/shared/api/types";

export const SESSION_COOKIE = "miy_session";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(status: number, body: ApiErrorBody) {
  return NextResponse.json({ success: false, error: body }, { status });
}

export function requireSession(req: NextRequest): NextResponse | null {
  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    return fail(401, err("AUTH_REQUIRED", "Please sign in."));
  }
  return null;
}
