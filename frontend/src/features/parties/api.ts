"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import type { CounterpartyDetail, Customer, Debt } from "@/shared/api/types";

export type PartyKind = "customer" | "supplier";

const path = (kind: PartyKind) => (kind === "customer" ? "customers" : "suppliers");
const debtPath = (kind: PartyKind) => (kind === "customer" ? "receivables" : "payables");

function invalidateParties(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["parties"] });
  void qc.invalidateQueries({ queryKey: ["party"] });
  void qc.invalidateQueries({ queryKey: ["debts"] });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
  void qc.invalidateQueries({ queryKey: ["customers"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
}

export function usePartyList(kind: PartyKind) {
  return useQuery({
    queryKey: ["parties", kind],
    queryFn: () => api<Customer[]>(`/businesses/${BUSINESS_ID}/${path(kind)}`),
  });
}

export function usePartyDetail(kind: PartyKind, id: string | null) {
  return useQuery({
    queryKey: ["party", kind, id],
    queryFn: () => api<CounterpartyDetail<Customer>>(`/businesses/${BUSINESS_ID}/${path(kind)}/${id}`),
    enabled: id !== null,
  });
}

export function useCreateParty(kind: PartyKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; phone?: string }) =>
      api<Customer>(`/businesses/${BUSINESS_ID}/${path(kind)}`, { method: "POST", body: input }),
    onSuccess: () => invalidateParties(qc),
  });
}

export function useUpdateParty(kind: PartyKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api<Customer>(`/businesses/${BUSINESS_ID}/${path(kind)}/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => invalidateParties(qc),
  });
}

export function useAddDebt(kind: PartyKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { counterparty_id: string; amount_minor: number }) =>
      api<Debt>(`/businesses/${BUSINESS_ID}/${debtPath(kind)}`, { method: "POST", body: input }),
    onSuccess: () => invalidateParties(qc),
  });
}
