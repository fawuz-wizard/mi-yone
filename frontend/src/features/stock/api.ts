"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import type {
  AddStockInput,
  CreateProductInput,
  Product,
  StockCheckInput,
  StockMovement,
  Supplier,
  UpdateProductInput,
} from "@/shared/api/types";

const invalidateStock = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ["products"] });
  void qc.invalidateQueries({ queryKey: ["product"] });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
  void qc.invalidateQueries({ queryKey: ["debts"] });
};

export function useProductDetail(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => api<{ product: Product; movements: StockMovement[] }>(`/businesses/${BUSINESS_ID}/products/${id}`),
    enabled: id !== null,
  });
}

export function useSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<Supplier[]>(`/businesses/${BUSINESS_ID}/suppliers`),
    enabled,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      api<Product>(`/businesses/${BUSINESS_ID}/products`, { method: "POST", body: input }),
    onSuccess: () => invalidateStock(qc),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      api<Product>(`/businesses/${BUSINESS_ID}/products/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => invalidateStock(qc),
  });
}

export function useAddStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddStockInput }) =>
      api<{ product: Product }>(`/businesses/${BUSINESS_ID}/products/${id}/stock`, { method: "POST", body: input }),
    onSuccess: () => invalidateStock(qc),
  });
}

export function useStockCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StockCheckInput }) =>
      api<{ product: Product; movement: StockMovement | null }>(
        `/businesses/${BUSINESS_ID}/products/${id}/stock-check`,
        { method: "POST", body: input },
      ),
    onSuccess: () => invalidateStock(qc),
  });
}
