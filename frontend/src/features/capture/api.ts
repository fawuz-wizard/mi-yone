"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  Category,
  CreateSaleInput,
  CreateTransactionInput,
  Customer,
  Debt,
  Product,
  SaleResult,
  Supplier,
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
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
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
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCategories(kind: "INCOME" | "EXPENSE", enabled: boolean) {
  return useQuery({
    queryKey: ["categories", kind],
    queryFn: () => api<Category[]>(`/businesses/${BUSINESS_ID}/categories?kind=${kind}`),
    enabled,
    staleTime: 5 * 60_000, // reference data
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

export function useSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<Supplier[]>(`/businesses/${BUSINESS_ID}/suppliers`),
    enabled,
  });
}

// Latest transactions (existing endpoint) — used ONLY for the interpreter's
// possible-duplicate check; nothing here computes financial truth.
export function useRecentTransactions(enabled: boolean) {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: () => api<Transaction[]>(`/businesses/${BUSINESS_ID}/transactions`),
    enabled,
  });
}

// Quick-entry PURCHASE routes to the EXISTING add-stock endpoint (movement +
// expense or supplier payable in one unit of work, server-side).
export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      input,
    }: {
      productId: string;
      input: { quantity: number; unit_cost_minor: number; paid: boolean; supplier_id?: string; entry_method?: "manual" | "text" | "voice" };
    }) => api<{ product: Product }>(`/businesses/${BUSINESS_ID}/products/${productId}/stock`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

// Quick-entry CREDIT RECORD routes to the EXISTING manual debt endpoints.
export function useRecordDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, counterparty_id, amount_minor, entry_method }: { kind: "receivable" | "payable"; counterparty_id: string; amount_minor: number; entry_method?: "manual" | "text" | "voice" }) =>
      api<Debt>(`/businesses/${BUSINESS_ID}/${kind === "receivable" ? "receivables" : "payables"}`, {
        method: "POST",
        body: { counterparty_id, amount_minor, entry_method: entry_method ?? "manual" },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
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
      void qc.invalidateQueries({ queryKey: ["watch"] });
      void qc.invalidateQueries({ queryKey: ["trends"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
