"use client";
// About MI YONE — version, what it is, where it comes from.
import { useT } from "@/shared/i18n";
import pkg from "../../../../../package.json";

export default function AboutPage() {
  const t = useT();
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-xl font-bold">{t("about.title")}</h1>
      <div className="rounded-card border border-border bg-surface p-4">
        <p className="text-2xl font-bold text-brand">MI YONE</p>
        <p className="mt-1 text-sm font-semibold text-text-secondary">{t("about.tagline")}</p>
        <p className="mt-3 text-sm">{t("about.body")}</p>
        <p className="mt-3 text-sm text-text-secondary">{t("about.credit")}</p>
        <p className="mt-3 text-sm text-text-secondary" data-testid="about-version">
          {t("about.version")}: {pkg.version}
        </p>
      </div>
    </div>
  );
}
