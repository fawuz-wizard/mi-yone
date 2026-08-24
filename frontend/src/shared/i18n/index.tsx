"use client";
// Catalog-driven strings (Phase 5 §41). No hard-coded user-facing text in components.
// Full-sentence templates with {placeholders} — no concatenation (Krio-ready, Phase 4 §30).
import { createContext, useCallback, useContext, type ReactNode } from "react";
import en from "./messages/en.json";

type Catalog = Record<string, string>;
const catalogs: Record<string, Catalog> = { en };

const I18nContext = createContext<{ locale: string }>({ locale: "en" });

export function I18nProvider({ locale = "en", children }: { locale?: string; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale }}>{children}</I18nContext.Provider>;
}

export function useT() {
  const { locale } = useContext(I18nContext);
  return useCallback(
    (id: string, vars?: Record<string, string | number>) => {
      const template = catalogs[locale]?.[id] ?? catalogs.en[id] ?? id;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    },
    [locale],
  );
}
