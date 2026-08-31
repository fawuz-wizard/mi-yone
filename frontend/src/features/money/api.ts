"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { Debt, SettlementResult } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";

export function useDebts(kind: "receivable" | "payable", enabled: boolean) {
  return useQuery({
    queryKey: ["debts", kind],
    queryFn: () => api<Debt[]>(`/businesses/${BUSINESS_ID}/${kind === "receivable" ? "receivables" : "payables"}`),
    enabled,
  });
}

export function useRemoveDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (debtId: string) =>
      api<{ reversed: boolean }>(`/businesses/${BUSINESS_ID}/debts/${debtId}/reverse`, { method: "POST", body: {} }),
    onSuccess: () => {
      // A credit sale's debt is the only door to that sale, so removing it can
      // change stock and the sales count too — refresh everything that reads
      // from the ledger rather than guessing what moved.
      for (const key of ["debts", "transactions", "dashboard", "watch", "products", "parties", "reports"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useSettleDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ debtId, amountMinor }: { debtId: string; amountMinor: number }) =>
      api<SettlementResult>(`/businesses/${BUSINESS_ID}/debts/${debtId}/settlements`, {
        method: "POST",
        body: { amount_minor: amountMinor },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
      void qc.invalidateQueries({ queryKey: ["party"] });
      void qc.invalidateQueries({ queryKey: ["parties"] });
    },
  });
}
