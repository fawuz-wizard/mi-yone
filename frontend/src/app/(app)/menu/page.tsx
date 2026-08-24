"use client";
// Placeholder within the design system: Menu destinations ship in Gates C–E.
import { EmptyState } from "@/shared/design-system/EmptyState";
import { useT } from "@/shared/i18n";

export default function MenuPage() {
  const t = useT();
  return (
    <div className="pt-2">
      <EmptyState title={t("menu.placeholderTitle")} body={t("menu.placeholderBody")} />
    </div>
  );
}
