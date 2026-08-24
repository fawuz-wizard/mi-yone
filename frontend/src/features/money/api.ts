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
      void qc.invalidateQueries({ queryKey: ["party"] });
      void qc.invalidateQueries({ queryKey: ["parties"] });
    },
  });
}
