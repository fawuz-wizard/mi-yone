"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { Money, Product, Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";

export interface CheckoutLine {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: Money;
  line_total: Money;
}

export interface CheckoutResult {
  transaction: Transaction | null;
  total: Money; // SERVER-computed — the number the toast shows
  lines: CheckoutLine[];
}

export function useScanProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>(`/businesses/${BUSINESS_ID}/products`),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ items, idempotencyKey }: { items: { product_id: string; quantity: number }[]; idempotencyKey: string }) =>
      api<CheckoutResult>(`/businesses/${BUSINESS_ID}/sales/checkout`, { method: "POST", body: { items }, idempotencyKey }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
