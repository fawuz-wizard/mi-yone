import { NextResponse } from "next/server";
import { ok, SESSION_COOKIE } from "@/mocks/http";

export async function POST() {
  const res = ok({}) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
