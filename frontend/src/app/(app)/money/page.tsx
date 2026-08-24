"use client";
// Money (Phase 5 §27–29 + 5D): five tabs, search, date-grouped cards on mobile,
// table on desktop, person-led debt cards with the Mark-as-paid flow.
import { useQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/shared/api/client";
import type { Debt, Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
import { RecordCard } from "@/shared/design-system/RecordCard";
import { ListSection } from "@/shared/design-system/ListSection";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { SearchField } from "@/shared/design-system/SearchField";
import { Button } from "@/shared/design-system/Button";
import { useCapture } from "@/features/shell/AppShell";
import { RecordDetailSheet } from "@/features/money/RecordDetailSheet";
import { DebtCard } from "@/features/money/DebtCard";
import { DebtDetailSheet } from "@/features/money/DebtDetailSheet";
import { MoneyTable } from "@/features/money/MoneyTable";
import { useDebts } from "@/features/money/api";
import { useCategories } from "@/features/capture/api";
import { ChipPicker } from "@/shared/design-system/ChipPicker";
import { useT } from "@/shared/i18n";

type Tab = "all" | "in" | "out" | "owed" | "owe";

export default function MoneyPage() {
  return (
    <Suspense>
      <MoneyScreen />
    </Suspense>
  );
}

function MoneyScreen() {
  const t = useT();
  const { openCapture } = useCapture();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);

  const [datePreset, setDatePreset] = useState<"all" | "today" | "7d" | "30d">("all");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const isDebtTab = tab === "owed" || tab === "owe";
  const kind = tab === "in" ? "INCOME" : tab === "out" ? "EXPENSE" : null;
  const categoriesQuery = useCategories(kind ?? "EXPENSE", kind !== null);
  const categoryName = categoryId ? (categoriesQuery.data ?? []).find((c) => c.id === categoryId)?.name : undefined;

  // Server-side filters (Phase 5 rule: the server slices the ledger, the client displays).
  const params2 = new URLSearchParams();
  if (kind) params2.set("type", kind);
  if (categoryName) params2.set("category", categoryName);
  if (datePreset !== "all") {
    const days = datePreset === "today" ? 0 : datePreset === "7d" ? 6 : 29;
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    params2.set("from", from);
  }
  const listQuery = useQuery({
    queryKey: ["transactions", tab, datePreset, categoryName ?? "any"],
    queryFn: () => api<Transaction[]>(`/businesses/${BUSINESS_ID}/transactions?${params2.toString()}`),
    enabled: !isDebtTab,
  });
  const debtsQuery = useDebts(tab === "owe" ? "payable" : "receivable", isDebtTab);

  const q = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      (listQuery.data ?? []).filter(
        (tx) =>
          q === "" ||
          (tx.description ?? "").toLowerCase().includes(q) ||
          tx.category_name.toLowerCase().includes(q) ||
          tx.amount.display.toLowerCase().includes(q),
      ),
    [listQuery.data, q],
  );
  const filteredDebts = useMemo(
    () => (debtsQuery.data ?? []).filter((d) => q === "" || d.counterparty_name.toLowerCase().includes(q)),
    [debtsQuery.data, q],
  );

  const debtTotal = useMemo(
    () => (debtsQuery.data ?? []).reduce((a, d) => a + d.outstanding.amount_minor, 0),
    [debtsQuery.data],
  );

  return (
    <div className="space-y-4 pt-2">
      <h1 className="sr-only">{t("money.question")}</h1>
      <SegmentedTabs
        ariaLabel={t("money.question")}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setQuery("");
          setCategoryId(null);
        }}
        tabs={[
          { value: "all", label: t("money.tabAll") },
          { value: "in", label: t("money.tabIn") },
          { value: "out", label: t("money.tabOut") },
          { value: "owed", label: t("money.tabOwedToYou") },
          { value: "owe", label: t("money.tabYouOwe") },
        ]}
      />
      <SearchField value={query} onChange={setQuery} />

      {/* Date history + category filters (server-side; scope everything below) */}
      {!isDebtTab ? (
        <div className="space-y-2">
          <div role="radiogroup" aria-label={t("filter.dateLabel")} className="flex flex-wrap gap-2">
            {(
              [
                ["all", t("filter.all")],
                ["today", t("filter.today")],
                ["7d", t("filter.7d")],
                ["30d", t("filter.30d")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={datePreset === value}
                onClick={() => setDatePreset(value)}
                data-testid={`filter-${value}`}
                className={`min-h-[44px] rounded-pill border px-3 text-[13px] font-semibold transition-colors duration-fast ${
                  datePreset === value
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-border bg-surface text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {kind && (categoriesQuery.data?.length ?? 0) > 0 ? (
            <ChipPicker
              label={t("filter.categoryLabel")}
              options={(categoriesQuery.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
              selectedId={categoryId}
              onSelect={setCategoryId}
              visibleCount={4}
            />
          ) : null}
        </div>
      ) : null}

      {isDebtTab ? (
        debtsQuery.isPending ? (
          <SkeletonList rows={3} />
        ) : (debtsQuery.data ?? []).length === 0 ? (
          <EmptyState title={t(tab === "owed" ? "money.owedEmptyTitle" : "money.oweEmptyTitle")} body="" />
        ) : (
          <>
            {debtTotal > 0 ? (
              <p className="money px-1 text-sm font-semibold text-text-secondary" data-testid="debt-total">
                {t(tab === "owed" ? "money.owedTotal" : "money.oweTotal", {
                  amount: (debtsQuery.data ?? [])[0] ? formatTotal(debtTotal) : "",
                })}
              </p>
            ) : null}
            <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {filteredDebts.map((d) => (
                <DebtCard key={d.id} debt={d} onPress={() => setSelectedDebt(d)} />
              ))}
              {filteredDebts.length === 0 ? (
                <p className="bg-surface px-4 py-4 text-sm text-text-secondary">{t("money.searchNoResults")}</p>
              ) : null}
            </div>
          </>
        )
      ) : listQuery.isPending ? (
        <SkeletonList rows={5} />
      ) : listQuery.isError ? (
        <EmptyState
          title={t("home.updateFailed")}
          body=""
          action={
            <Button fullWidth level="secondary" onClick={() => void listQuery.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : filteredRows.length === 0 && q !== "" ? (
        <EmptyState title={t("money.searchNoResults")} body="" />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={t("money.emptyTitle")}
          body=""
          action={
            <Button fullWidth onClick={() => openCapture("sale")}>
              {t("money.emptyAction")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile: date-grouped cards */}
          <div className="space-y-4 lg:hidden">
            {groupByDay(filteredRows).map((group) => (
              <ListSection key={group.key} heading={labelForDay(group.key, t)}>
                {group.rows.map((tx) => (
                  <RecordCard key={tx.id} transaction={tx} onPress={() => setSelected(tx)} />
                ))}
              </ListSection>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden lg:block">
            <MoneyTable rows={filteredRows} onOpen={setSelected} />
          </div>
        </>
      )}

      <RecordDetailSheet transaction={selected} onClose={() => setSelected(null)} />
      <DebtDetailSheet
        debt={selectedDebt}
        kind={tab === "owe" ? "payable" : "receivable"}
        onClose={() => setSelectedDebt(null)}
      />
    </div>
  );
}

// Grouping-only display helper: renders the server minor units with grouping.
// Not financial calculation — the total is a sum of server-provided outstanding
// values for display in one line; each figure shown per-debt is server-formatted.
function formatTotal(minor: number): string {
  const whole = Math.trunc(minor / 100);
  return `Le ${whole.toLocaleString("en-US")}`;
}

function groupByDay(rows: Transaction[]): { key: string; rows: Transaction[] }[] {
  const groups = new Map<string, Transaction[]>();
  rows.forEach((tx) => {
    const key = tx.occurred_at.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  });
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({ key, rows: list }));
}

function labelForDay(key: string, t: (id: string) => string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (key === today) return t("money.today");
  if (key === yesterday) return t("money.yesterday");
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
