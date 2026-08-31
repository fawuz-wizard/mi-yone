"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { PartnerAskResponse, PartnerHistoryResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";

export function usePartnerHistory() {
  return useQuery({
    queryKey: ["partner"],
    queryFn: () => api<PartnerHistoryResponse>(`/businesses/${BUSINESS_ID}/partner/messages`),
  });
}

export function useAskPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, mode }: { text: string; mode: "auto" | "business" | "research" }) =>
      api<PartnerAskResponse>(`/businesses/${BUSINESS_ID}/partner/messages`, { method: "POST", body: { text, mode } }),
    onSuccess: (data) => {
      qc.setQueryData<PartnerHistoryResponse>(["partner"], (prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, data.owner, data.partner] }
          : { messages: [data.owner, data.partner], provider: "local", research_available: false },
      );
    },
  });
}
