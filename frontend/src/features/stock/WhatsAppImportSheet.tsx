"use client";
// WhatsApp catalog import — connect → import → review each product → approve or
// skip. Nothing becomes a MI YONE product without the owner's approval; likely
// duplicates are flagged before they can be created twice. In test mode the
// sheet says plainly that this is the sample catalog, not a live connection.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { api, isDomainError } from "@/shared/api/client";
import type { WaImport, WaItem, WaStatusResponse } from "@/shared/api/types";
import { BUSINESS_ID } from "@/shared/api/session";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { useToast } from "@/shared/design-system/Toast";
import { useT } from "@/shared/i18n";

const WA = `/businesses/${BUSINESS_ID}/integrations/whatsapp`;

// Disconnecting keeps the import history and every product already brought in;
// reconnecting later reactivates the same connection.
function useWaDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Record<string, never>>(`/businesses/${BUSINESS_ID}/integrations/whatsapp/connection`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa"] }),
  });
}

function useWaStatus(enabled: boolean) {
  return useQuery({ queryKey: ["wa"], queryFn: () => api<WaStatusResponse>(WA), enabled });
}

export function WhatsAppImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const status = useWaStatus(open);
  const disconnect = useWaDisconnect();
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["wa"] });
  const refreshProducts = () => {
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["watch"] });
    void qc.invalidateQueries({ queryKey: ["trends"] });
  };

  const connect = useMutation({
    mutationFn: () => api(`${WA}/connect`, { method: "POST", body: {} }),
    onSuccess: refresh,
    onError: (e) => setErrorText(isDomainError(e) ? t(e.messageId) : t("error.generic")),
  });
  const runImport = useMutation({
    mutationFn: () => api<WaImport>(`${WA}/imports`, { method: "POST", body: {} }),
    onSuccess: refresh,
    onError: (e) => setErrorText(isDomainError(e) ? t(e.messageId) : t("error.generic")),
  });

  const data = status.data;
  const imp = data?.latest_import ?? null;

  return (
    <BottomSheet open={open} title={t("wa.title")} onClose={onClose}>
      <div className="space-y-4 pb-4">
        {data?.mode === "test" ? (
          <p className="rounded-card bg-sunken px-3 py-2 text-sm text-text-secondary" data-testid="wa-test-note">
            {t("wa.testMode")}
          </p>
        ) : null}
        {errorText ? (
          <p role="alert" className="rounded-card bg-danger-fill px-3 py-2 text-sm font-medium text-danger">
            {errorText}
          </p>
        ) : null}

        {status.isPending ? (
          <p className="text-sm text-text-secondary">{t("wa.importing")}</p>
        ) : !data?.connection ? (
          <div className="space-y-3">
            <p className="text-base font-semibold">{t("wa.introTitle")}</p>
            <p className="text-sm text-text-secondary">{t("wa.introBody")}</p>
            <Button fullWidth onClick={() => connect.mutate()} loading={connect.isPending} loadingLabel={t("wa.connect")} data-testid="wa-connect">
              {t("wa.connect")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="rounded-pill bg-money-in-tint px-3 py-1 text-sm font-semibold text-money-in">{t("wa.connected")}</span>
              <Button level="secondary" onClick={() => runImport.mutate()} loading={runImport.isPending} loadingLabel={t("wa.importing")} data-testid="wa-import">
                {t("wa.import")}
              </Button>
            </div>

            {/* The Menu row promises "connect, import or disconnect" — this is
                the disconnect it promised. */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                data-testid="wa-disconnect"
                className="min-h-[40px] text-sm font-semibold text-danger underline"
              >
                {t("wa.disconnect")}
              </button>
            </div>

            {imp?.status === "FAILED" ? (
              <div role="alert" className="rounded-card bg-danger-fill p-3">
                <p className="text-sm font-semibold text-danger">{t("wa.failedTitle")}</p>
                {imp.error ? <p className="mt-1 text-sm text-text-primary">{imp.error}</p> : null}
                <div className="mt-2">
                  <Button level="secondary" onClick={() => runImport.mutate()}>
                    {t("common.retry")}
                  </Button>
                </div>
              </div>
            ) : null}

            {imp && imp.status === "IMPORTED" ? (
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {imp.needs_review > 0 ? `${t("wa.summaryLine", {
                    found: String(imp.items.length),
                    fresh: String(imp.items.filter((i) => !i.duplicate_of_product_id).length),
                    matched: String(imp.items.filter((i) => i.duplicate_of_product_id).length),
                  })} · ${t("wa.needsReview", { count: String(imp.needs_review) })}` : t("wa.allDone", {
                    added: String(imp.items.filter((i) => i.status === "APPROVED").length),
                    skipped: String(imp.items.filter((i) => i.status === "SKIPPED").length),
                  })}
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
                  {imp.items.map((item) => (
                    <ImportItemRow key={item.id} item={item} onDone={(msg) => { toast.show({ message: msg }); refresh(); refreshProducts(); }} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmingDisconnect}
        title={t("wa.disconnectConfirmTitle")}
        body={t("wa.disconnectConfirmBody")}
        confirmLabel={t("wa.disconnect")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              setConfirmingDisconnect(false);
              toast.show({ message: t("wa.disconnected") });
            },
          })
        }
        onCancel={() => setConfirmingDisconnect(false)}
      />
    </BottomSheet>
  );
}

function ImportItemRow({ item, onDone }: { item: WaItem; onDone: (toastMessage: string) => void }) {
  const t = useT();
  const [priceStr, setPriceStr] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: (body: { selling_price_minor?: number; initial_stock?: number }) =>
      api<{ item: WaItem }>(`${WA}/items/${item.id}/approve`, { method: "POST", body }),
    onSuccess: () => onDone(t("wa.added", { name: item.name })),
    onError: (e) => setErrorText(isDomainError(e) ? t(e.messageId) : t("error.generic")),
  });
  const skip = useMutation({
    mutationFn: () => api<WaItem>(`${WA}/items/${item.id}/skip`, { method: "POST", body: {} }),
    onSuccess: () => onDone(t("wa.skippedToast", { name: item.name })),
    onError: (e) => setErrorText(isDomainError(e) ? t(e.messageId) : t("error.generic")),
  });

  const [stockStr, setStockStr] = useState("");
  const needsPrice = item.price === null;
  const priceValid = /^\d+(\.\d{1,2})?$/.test(priceStr);
  const stockValid = stockStr === "" || /^\d+$/.test(stockStr);
  const submitApprove = () => {
    setErrorText(null);
    const body: { selling_price_minor?: number; initial_stock?: number } = {};
    if (needsPrice && priceValid) body.selling_price_minor = Math.round(Number(priceStr) * 100);
    if (stockStr !== "" && stockValid) body.initial_stock = Number(stockStr);
    approve.mutate(body);
  };

  return (
    <div className="space-y-2 bg-surface p-3" data-testid="wa-item">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</p>
        {item.status === "NEEDS_REVIEW" ? (
          <span className="money shrink-0 text-sm font-semibold">{item.price ? item.price.display : "—"}</span>
        ) : (
          <span className="shrink-0 rounded-pill bg-sunken px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {t(item.status === "APPROVED" ? "wa.statusApproved" : "wa.statusSkipped")}
          </span>
        )}
      </div>
      {item.description || item.sku || item.category ? (
        <p className="truncate text-xs text-text-secondary">
          {[item.sku, item.category, item.description].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {item.status === "NEEDS_REVIEW" ? (
        <>
          {item.duplicate_name ? (
            <p className="flex items-start gap-1.5 rounded-card bg-warning-fill px-2 py-1.5 text-xs font-medium" data-testid="wa-dup-warn">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              {t("wa.duplicateWarn", { name: item.duplicate_name })}
            </p>
          ) : null}
          {needsPrice ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("wa.noPrice")}</span>
              <input
                inputMode="decimal"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                aria-label={t("wa.priceLabel")}
                data-testid="wa-price-input"
                className="mt-1 min-h-[44px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
              />
            </label>
          ) : null}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("stock.initialStock")}</span>
            <input
              inputMode="numeric"
              value={stockStr}
              onChange={(e) => setStockStr(e.target.value)}
              data-testid="wa-stock-input"
              className="mt-1 min-h-[44px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
            />
          </label>
          {errorText ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errorText}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={submitApprove}
              disabled={(needsPrice && !priceValid) || !stockValid}
              loading={approve.isPending}
              loadingLabel={t("wa.add")}
              data-testid="wa-approve"
            >
              {t("wa.add")}
            </Button>
            <Button level="secondary" onClick={() => skip.mutate()} loading={skip.isPending} loadingLabel={t("wa.skip")} data-testid="wa-skip">
              {t("wa.skip")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
