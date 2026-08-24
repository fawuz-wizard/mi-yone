"use client";
// AttentionRow (Phase 4 §13): one "needs attention" item, one tap from the fix.
import Link from "next/link";
import { ChevronRight, AlertTriangle, TriangleAlert } from "lucide-react";
import type { AttentionItem } from "@/shared/api/types";

export function AttentionRow({ item }: { item: AttentionItem }) {
  const danger = item.severity === "danger";
  const Icon = danger ? TriangleAlert : AlertTriangle;
  return (
    <Link
      href={item.target}
      className={`flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors duration-fast active:bg-sunken ${
        danger ? "bg-danger-fill" : "bg-warning-fill"
      }`}
    >
      <Icon aria-hidden size={18} strokeWidth={2} className={danger ? "text-danger" : "text-warning"} />
      <span className="money flex-1 text-sm font-medium text-text-primary">{item.text}</span>
      <ChevronRight aria-hidden size={18} className="text-text-secondary" />
    </Link>
  );
}
