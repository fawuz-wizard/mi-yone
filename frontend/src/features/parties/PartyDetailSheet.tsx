"use client";
// Counterparty detail (Phase 4 §20–21): contact header, debt block, payments via
// the same debt flow, manual debts, history, notes, archive. Not a CRM.
import { Phone } from "lucide-react";
import { useEffect, useState } from "react";
import type { Debt } from "@/shared/api/types";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { MoneyDisplay } from "@/shared/design-system/MoneyDisplay";
import { RecordCard } from "@/shared/design-system/RecordCard";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { DebtCard } from "@/features/money/DebtCard";
import { DebtDetailSheet } from "@/features/money/DebtDetailSheet";
import { useT } from "@/shared/i18n";
import { useAddDebt, usePartyDetail, useUpdateParty, type PartyKind } from "./api";

export function PartyDetailSheet({
  kind,
  partyId,
  onClose,
}: {
  kind: PartyKind;
  partyId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const detail = usePartyDetail(kind, partyId);
  const update = useUpdateParty(kind);
  const addDebt = useAddDebt(kind);

  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [addingDebt, setAddingDebt] = useState(false);
  const [debtAmount, setDebtAmount] = useState<AmountState>(EMPTY_AMOUNT);
  const [notes, setNotes] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

  const party = detail.data?.party;
  useEffect(() => {
    setNotes(party?.notes ?? "");
  }, [party?.id, party?.notes]);

  if (!partyId) return null;
  const isCustomer = kind === "customer";
  const hasDebt = (party?.outstanding.amount_minor ?? 0) > 0;

  function closeAll() {
    setSelectedDebt(null);
    setAddingDebt(false);
    setDebtAmount(EMPTY_AMOUNT);
    setConfirmArchive(false);
    onClose();
  }

  async function submitDebt() {
    if (!party || isEmpty(debtAmount)) return;
    try {
      const debt = await addDebt.mutateAsync({ counterparty_id: party.id, amount_minor: toMinor(debtAmount) });
      toast.show({ message: t("parties.debtAdded", { amount: debt.amount.display }) });
      setAddingDebt(false);
      setDebtAmount(EMPTY_AMOUNT);
    } catch {
      toast.show({ message: t("error.generic") });
    }
  }

  return (
    <>
      <BottomSheet
        open={!addingDebt && selectedDebt === null}
        title={party?.name ?? ""}
        onClose={closeAll}
        footer={
          party ? (
            <div className="flex flex-col gap-2">
              <Button level="secondary" fullWidth onClick={() => setAddingDebt(true)} data-testid="add-debt">
                {t("parties.addDebt")}
              </Button>
              <Button level="tertiary" fullWidth onClick={() => setConfirmArchive(true)} data-testid="archive-party">
                {t("parties.archive")}
              </Button>
            </div>
          ) : undefined
        }
      >
        {party ? (
          <div className="space-y-4 pb-4">
            {/* Contact — call via the phone's own dialer, no in-app messaging. */}
            {party.phone ? (
              <a
                href={`tel:${party.phone}`}
                aria-label={t("parties.call", { name: party.name })}
                className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-brand"
              >
                <Phone size={16} aria-hidden /> {party.phone}
              </a>
            ) : null}

            {/* The debt block — same objects as Money's Owed tabs, one source two doors. */}
            <div className={`rounded-card p-3 ${hasDebt ? "bg-warning-fill" : "bg-sunken"}`}>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {isCustomer ? t("money.tabOwedToYou") : t("money.tabYouOwe")}
              </p>
              <MoneyDisplay money={party.outstanding} variant="hero" />
            </div>
            {(detail.data?.open_debts.length ?? 0) > 0 ? (
              <div>
                <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                  {t("parties.openDebts")}
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
                  {detail.data!.open_debts.map((d) => (
                    <DebtCard key={d.id} debt={d} onPress={() => setSelectedDebt(d)} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* History: their sales, payments — counterparty-linked ledger rows. */}
            <div>
              <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("parties.history")}
              </p>
              {(detail.data?.history.length ?? 0) === 0 ? (
                <p className="text-sm text-text-secondary">{t("parties.noHistory")}</p>
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
                  {detail.data!.history.map((tx) => (
                    <RecordCard key={tx.id} transaction={tx} />
                  ))}
                </div>
              )}
            </div>

            {/* Notes — free text, saved explicitly. */}
            <label className="block">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("parties.notes")}
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-input border border-border-input bg-surface px-3 py-2 text-base"
                data-testid="party-notes"
              />
            </label>
            {notes !== (party.notes ?? "") ? (
              <Button
                level="secondary"
                fullWidth
                loading={update.isPending}
                onClick={() =>
                  void update
                    .mutateAsync({ id: party.id, input: { notes } })
                    .then(() => toast.show({ message: t("parties.notesSaved") }))
                    .catch(() => toast.show({ message: t("error.generic") }))
                }
                data-testid="save-notes"
              >
                {t("parties.notesSave")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>

      {/* Manual debt — the notebook case: "Aminata owes me from before MI YONE". */}
      <BottomSheet
        open={addingDebt}
        title={
          party
            ? t(isCustomer ? "parties.addDebtCustomer" : "parties.addDebtSupplier", { name: party.name })
            : ""
        }
        onClose={() => setAddingDebt(false)}
        footer={
          <Button
            fullWidth
            disabled={isEmpty(debtAmount)}
            loading={addDebt.isPending}
            loadingLabel={t("common.save")}
            onClick={() => void submitDebt()}
            data-testid="add-debt-save"
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="pb-4">
          <AmountKeypad value={debtAmount} onChange={setDebtAmount} />
        </div>
      </BottomSheet>

      {/* Payment: the exact same flow as Money's debt tabs. */}
      <DebtDetailSheet
        debt={selectedDebt}
        kind={isCustomer ? "receivable" : "payable"}
        onClose={() => setSelectedDebt(null)}
      />

      {party ? (
        <ConfirmDialog
          open={confirmArchive}
          title={t("parties.archiveTitle", { name: party.name })}
          body={t("parties.archiveBody")}
          confirmLabel={t("parties.archive")}
          cancelLabel={t("common.cancel")}
          destructive
          onConfirm={() => {
            void update
              .mutateAsync({ id: party.id, input: { archived: true } })
              .then(() => {
                toast.show({ message: t("parties.archivedToast") });
                closeAll();
              })
              .catch(() => toast.show({ message: t("error.generic") }));
          }}
          onCancel={() => setConfirmArchive(false)}
        />
      ) : null}
    </>
  );
}
