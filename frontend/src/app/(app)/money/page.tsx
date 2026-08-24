"use client";
// Money (Phase 5 §27–29): tabs, date-grouped list, record detail, Fix with history.
import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/shared/api/client";
import type { Transaction } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
import { RecordCard } from "@/shared/design-system/RecordCard";
import { ListSection } from "@/shared/design-system/ListSection";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { Button } from "@/shared/design-system/Button";
import { useCapture } from "@/features/shell/AppShell";
import { RecordDetailSheet } from "@/features/money/RecordDetailSheet";
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
  const [selected, setSelected] = useState<Transaction | null>(null);

  const typeParam = tab === "in" ? "?type=INCOME" : tab === "out" ? "?type=EXPENSE" : "";
  const listQuery = useQuery({
    queryKey: ["transactions", tab === "owed" || tab === "owe" ? "all" : tab],
    queryFn: () => api<Transaction[]>(`/businesses/${BUSINESS_ID}/transactions${typeParam}`),
    enabled: tab !== "owed" && tab !== "owe",
  });

  return (
    <div className="space-y-4 pt-2">
      <h1 className="sr-only">{t("money.question")}</h1>
      <SegmentedTabs
        ariaLabel={t("money.question")}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: t("money.tabAll") },
          { value: "in", label: t("money.tabIn") },
          { value: "out", label: t("money.tabOut") },
          { value: "owed", label: t("money.tabOwedToYou") },
          { value: "owe", label: t("money.tabYouOwe") },
        ]}
      />

      {tab === "owed" || tab === "owe" ? (
        <EmptyState
          title={t("money.tabOwedToYou")}
          body={t("money.emptyTitle")}
        />
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
      ) : listQuery.data.length === 0 ? (
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
        groupByDay(listQuery.data).map((group) => (
          <ListSection key={group.key} heading={labelForDay(group.key, t)}>
            {group.rows.map((tx) => (
              <RecordCard key={tx.id} transaction={tx} onPress={() => setSelected(tx)} />
            ))}
          </ListSection>
        ))
      )}

      <RecordDetailSheet transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
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
