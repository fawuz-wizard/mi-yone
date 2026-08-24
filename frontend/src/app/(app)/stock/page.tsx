"use client";
// Placeholder within the design system: Stock ships in Gate C (Phase 5 §56).
import { EmptyState } from "@/shared/design-system/EmptyState";
import { useT } from "@/shared/i18n";

export default function StockPage() {
  const t = useT();
  return (
    <div className="pt-2">
      <EmptyState title={t("stock.placeholderTitle")} body={t("stock.placeholderBody")} />
    </div>
  );
}
