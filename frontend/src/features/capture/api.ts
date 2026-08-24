"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { CreateTransactionInput, Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateTransactionInput; idempotencyKey: string }) =>
      api<Transaction>(`/businesses/${BUSINESS_ID}/transactions`, {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useUndoTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) =>
      api(`/businesses/${BUSINESS_ID}/transactions/${txId}/reverse`, { method: "POST", body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
