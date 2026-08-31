"use client";
// Settings center data hooks — existing endpoints + the settings additions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import { useMe, type MeResponse } from "@/shared/api/me";

export { useMe, type MeResponse };

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; phone?: string; email?: string }) =>
      api<MeResponse>("/auth/me", { method: "PATCH", body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useUpdateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api<{ id: string; name: string }>(`/businesses/${BUSINESS_ID}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      api<Record<string, never>>("/auth/change-password", { method: "POST", body: input }),
  });
}

export interface SessionRow {
  id: string;
  created_at: string;
  current: boolean;
}

export function useSessions(enabled = true) {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<{ sessions: SessionRow[] }>("/auth/sessions"),
    enabled,
  });
}

export function useSignOutOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ signed_out: number }>("/auth/sessions/sign-out-others", { method: "POST", body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export interface AlertPrefs {
  stock: boolean;
  debts: boolean;
  money: boolean;
  records: boolean;
}

export function useAlertPrefs(enabled = true) {
  return useQuery({
    queryKey: ["alert-prefs"],
    queryFn: () => api<AlertPrefs>(`/businesses/${BUSINESS_ID}/settings/alerts`),
    enabled,
  });
}

export function useUpdateAlertPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AlertPrefs) =>
      api<AlertPrefs>(`/businesses/${BUSINESS_ID}/settings/alerts`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alert-prefs"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
    },
  });
}

export function useDisconnectWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Record<string, never>>(`/businesses/${BUSINESS_ID}/integrations/whatsapp/connection`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa"] }),
  });
}

export async function signOut(): Promise<void> {
  try {
    await api<Record<string, never>>("/auth/logout", { method: "POST", body: {} });
  } finally {
    try {
      window.localStorage.removeItem("miy_business_id");
    } catch {
      /* storage unavailable — cookie is cleared regardless */
    }
    window.location.assign("/welcome");
  }
}
