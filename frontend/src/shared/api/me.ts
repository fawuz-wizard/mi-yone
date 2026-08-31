"use client";
// Signed-in identity — the ONE source for "who am I / which business" in the
// UI. Lives in shared so the shell and settings both use it (features never
// import each other).
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface MeResponse {
  user: { name: string; phone: string | null; email: string | null };
  business: { id: string; name: string; currency: string; initial: string } | null;
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/auth/me"), enabled, staleTime: 60_000 });
}
