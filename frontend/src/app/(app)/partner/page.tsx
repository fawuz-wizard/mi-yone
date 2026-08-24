"use client";
// Placeholder within the design system: Partner ships in Gate D (Phase 5 §56).
import { EmptyState } from "@/shared/design-system/EmptyState";
import { useT } from "@/shared/i18n";

export default function PartnerPage() {
  const t = useT();
  return (
    <div className="pt-2">
      <EmptyState title={t("partner.placeholderTitle")} body={t("partner.placeholderBody")} />
    </div>
  );
}
