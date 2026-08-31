"use client";
// Menu (Phase 4 §5, refined per owner brief): the account/settings center.
// Core business functions stay in the primary navigation — Menu answers
// "how do I manage my account, business settings, preferences, security,
// support, and MI YONE information?"
import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  ChevronRight,
  CircleHelp,
  FileText,
  Info,
  LogOut,
  MessageCircle,
  Moon,
  Shield,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { WhatsAppImportSheet } from "@/features/stock/WhatsAppImportSheet";
import { signOut, useMe } from "@/features/settings/api";
import {
  AlertsSheet,
  AppearanceSheet,
  BusinessSheet,
  ProfileSheet,
  SecuritySheet,
} from "@/features/settings/SettingsSheets";
import { useT } from "@/shared/i18n";

type SheetName = "profile" | "business" | "appearance" | "alerts" | "security" | "whatsapp" | null;

export default function MenuPage() {
  const t = useT();
  const me = useMe();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const user = me.data?.user;
  const business = me.data?.business;

  return (
    <div className="space-y-4 pt-2">
      <h1 className="sr-only">{t("menu.question")}</h1>

      {/* Profile card */}
      <button
        onClick={() => setSheet("profile")}
        data-testid="menu-profile"
        className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left active:bg-sunken"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-brand-tint text-lg font-bold text-brand">
          {(user?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{user?.name ?? "—"}</span>
          <span className="block truncate text-sm text-text-secondary">
            {[business?.name, user?.email ?? user?.phone].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronRight aria-hidden size={18} className="text-text-secondary" />
      </button>

      {/* Business tools that already lived in Menu stay reachable */}
      <Section label={t("menu.sectionBusiness")}>
        <Row icon={Users} label={t("parties.customers")} sub={t("parties.customersQuestion")} href="/customers" />
        <Row icon={Truck} label={t("parties.suppliers")} sub={t("parties.suppliersQuestion")} href="/suppliers" />
        <Row icon={BarChart3} label={t("menu.insights")} sub={t("reports.question")} href="/insights" />
        <Row icon={Store} label={t("menu.businessSettings")} sub={t("menu.businessSub")} onPress={() => setSheet("business")} testId="menu-business" />
        <Row icon={MessageCircle} label={t("menu.whatsapp")} sub={t("menu.whatsappSub")} onPress={() => setSheet("whatsapp")} testId="menu-whatsapp" />
      </Section>

      <Section label={t("menu.sectionApp")}>
        <Row icon={Moon} label={t("menu.appearance")} sub={t("menu.appearanceSub")} onPress={() => setSheet("appearance")} testId="menu-appearance" />
        <Row icon={Bell} label={t("menu.alerts")} sub={t("menu.alertsSub")} onPress={() => setSheet("alerts")} testId="menu-alerts" />
        <Row icon={ShieldCheck} label={t("menu.security")} sub={t("menu.securitySub")} onPress={() => setSheet("security")} testId="menu-security" />
      </Section>

      <Section label={t("menu.sectionSupport")}>
        <Row icon={CircleHelp} label={t("menu.helpSupport")} href="/menu/help" />
        <Row icon={FileText} label={t("menu.terms")} href="/menu/terms" />
        <Row icon={Shield} label={t("menu.privacy")} href="/menu/privacy" />
        <Row icon={Info} label={t("menu.about")} href="/menu/about" />
      </Section>

      <button
        onClick={() => setConfirmSignOut(true)}
        data-testid="menu-signout"
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-card border border-border bg-surface text-base font-semibold text-danger active:bg-sunken"
      >
        <LogOut aria-hidden size={20} />
        {t("menu.signOut")}
      </button>

      <ProfileSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <BusinessSheet open={sheet === "business"} onClose={() => setSheet(null)} />
      <AppearanceSheet open={sheet === "appearance"} onClose={() => setSheet(null)} />
      <AlertsSheet open={sheet === "alerts"} onClose={() => setSheet(null)} />
      <SecuritySheet open={sheet === "security"} onClose={() => setSheet(null)} />
      <WhatsAppImportSheet open={sheet === "whatsapp"} onClose={() => setSheet(null)} />

      <ConfirmDialog
        open={confirmSignOut}
        title={t("menu.signOutConfirmTitle")}
        body={t("menu.signOutConfirmBody")}
        confirmLabel={t("menu.signOut")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void signOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  sub,
  href,
  onPress,
  testId,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>;
  label: string;
  sub?: string;
  href?: string;
  onPress?: () => void;
  testId?: string;
}) {
  const inner = (
    <>
      <Icon aria-hidden size={22} strokeWidth={2} className="text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        {sub ? <span className="block truncate text-sm text-text-secondary">{sub}</span> : null}
      </span>
      <ChevronRight aria-hidden size={18} className="text-text-secondary" />
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast active:bg-sunken";
  if (href) {
    return (
      <Link href={href} className={cls} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onPress} className={cls} data-testid={testId}>
      {inner}
    </button>
  );
}
