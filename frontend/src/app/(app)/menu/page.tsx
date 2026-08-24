"use client";
// Menu (Phase 4 §5): everything asked less than weekly — a labeled list, not a junk drawer.
import Link from "next/link";
import { ChevronRight, Users, Truck, BarChart3, Settings, UserCog, CircleHelp } from "lucide-react";
import { useT } from "@/shared/i18n";

export default function MenuPage() {
  const t = useT();
  const items = [
    { href: "/customers", icon: Users, label: t("parties.customers"), sub: t("parties.customersQuestion"), enabled: true },
    { href: "/suppliers", icon: Truck, label: t("parties.suppliers"), sub: t("parties.suppliersQuestion"), enabled: true },
    { href: "/insights", icon: BarChart3, label: t("menu.insights"), sub: t("reports.question"), enabled: true },
    { href: "#", icon: Settings, label: t("menu.settings"), sub: t("menu.comingSoon"), enabled: false },
    { href: "#", icon: UserCog, label: t("menu.people"), sub: t("menu.comingSoon"), enabled: false },
    { href: "#", icon: CircleHelp, label: t("menu.help"), sub: t("menu.comingSoon"), enabled: false },
  ];
  return (
    <div className="space-y-4 pt-2">
      <h1 className="sr-only">{t("menu.question")}</h1>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {items.map(({ href, icon: Icon, label, sub, enabled }) =>
          enabled ? (
            <Link
              key={label}
              href={href}
              className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors duration-fast active:bg-sunken"
            >
              <Icon aria-hidden size={22} strokeWidth={2} className="text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{label}</span>
                <span className="block text-sm text-text-secondary">{sub}</span>
              </span>
              <ChevronRight aria-hidden size={18} className="text-text-secondary" />
            </Link>
          ) : (
            <div key={label} className="flex min-h-[60px] items-center gap-3 px-4 py-3 opacity-50">
              <Icon aria-hidden size={22} strokeWidth={2} className="text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{label}</span>
                <span className="block text-sm text-text-secondary">{sub}</span>
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
