"use client";
// Customers / Suppliers list (Phase 4 §20–21) — one screen pattern, two kinds.
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { FormField } from "@/shared/design-system/FormField";
import { SearchField } from "@/shared/design-system/SearchField";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { useToast } from "@/shared/design-system/Toast";
import { useT } from "@/shared/i18n";
import { PartyDetailSheet } from "./PartyDetailSheet";
import { useCreateParty, usePartyList, type PartyKind } from "./api";

export function PartyScreen({ kind }: { kind: PartyKind }) {
  const t = useT();
  const toast = useToast();
  const list = usePartyList(kind);
  const create = useCreateParty(kind);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const isCustomer = kind === "customer";
  const rows = useMemo(
    () => (list.data ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [list.data, query],
  );

  async function submitCreate() {
    if (!name.trim()) return;
    try {
      const party = await create.mutateAsync({ name: name.trim(), phone: phone.trim() || undefined });
      toast.show({ message: t("parties.saved") });
      setCreating(false);
      setName("");
      setPhone("");
      setSelectedId(party.id);
    } catch {
      toast.show({ message: t("error.generic") });
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-bold">{t(isCustomer ? "parties.customers" : "parties.suppliers")}</h1>
      <p className="sr-only">{t(isCustomer ? "parties.customersQuestion" : "parties.suppliersQuestion")}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} />
        </div>
        <Button level="secondary" onClick={() => setCreating(true)} data-testid="new-party">
          <Plus size={16} aria-hidden /> {t(isCustomer ? "parties.newCustomer" : "parties.newSupplier")}
        </Button>
      </div>

      {list.isPending ? (
        <SkeletonList rows={4} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title={t(isCustomer ? "parties.emptyCustomers" : "parties.emptySuppliers")}
          body=""
          action={
            <Button fullWidth onClick={() => setCreating(true)}>
              {t(isCustomer ? "parties.newCustomer" : "parties.newSupplier")}
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              data-testid="party-row"
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast active:bg-sunken"
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill font-bold ${
                  p.outstanding.amount_minor > 0 ? "bg-warning-fill text-warning" : "bg-brand-tint text-brand"
                }`}
              >
                {p.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{p.name}</span>
                {p.phone ? <span className="block text-sm text-text-secondary">{p.phone}</span> : null}
              </span>
              {p.outstanding.amount_minor > 0 ? (
                <span className="money text-sm font-semibold text-warning">
                  {t(isCustomer ? "parties.owesYouAmount" : "parties.youOweAmount", {
                    amount: p.outstanding.display,
                  })}
                </span>
              ) : null}
            </button>
          ))}
          {rows.length === 0 ? (
            <p className="bg-surface px-4 py-4 text-sm text-text-secondary">{t("money.searchNoResults")}</p>
          ) : null}
        </div>
      )}

      <BottomSheet
        open={creating}
        title={t(isCustomer ? "parties.newCustomer" : "parties.newSupplier")}
        onClose={() => setCreating(false)}
        dirty={name.trim().length > 0}
        footer={
          <Button
            fullWidth
            disabled={!name.trim()}
            loading={create.isPending}
            loadingLabel={t("common.save")}
            onClick={() => void submitCreate()}
            data-testid="party-save"
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="space-y-4 pb-4">
          <FormField label={t("parties.name")} value={name} onChange={setName} />
          <FormField label={t("parties.phone")} value={phone} onChange={setPhone} inputMode="tel" optional />
        </div>
      </BottomSheet>

      <PartyDetailSheet kind={kind} partyId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
