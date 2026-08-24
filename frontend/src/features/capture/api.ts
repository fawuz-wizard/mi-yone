"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  CreateSaleInput,
  CreateTransactionInput,
  Customer,
  Product,
  SaleResult,
  Transaction,
} from "@/shared/api/types";
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

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateSaleInput; idempotencyKey: string }) =>
      api<SaleResult>(`/businesses/${BUSINESS_ID}/sales`, { method: "POST", body: input, idempotencyKey }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useProducts(enabled: boolean) {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>(`/businesses/${BUSINESS_ID}/products`),
    enabled,
  });
}

export function useCustomers(enabled: boolean) {
  return useQuery({
    queryKey: ["customers"],
    queryFn: () => api<Customer[]>(`/businesses/${BUSINESS_ID}/customers`),
    enabled,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Customer>(`/businesses/${BUSINESS_ID}/customers`, { method: "POST", body: { name } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["customers"] }),
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
