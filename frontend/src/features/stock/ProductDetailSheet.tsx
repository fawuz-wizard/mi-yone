"use client";
// Product detail (Phase 4 §19): prices, stock, estimated value, plain-sentence
// history, and the four actions: Add stock · Stock check · Edit · Archive.
import { useState } from "react";
import type { Product, StockMovement } from "@/shared/api/types";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { ChipPicker } from "@/shared/design-system/ChipPicker";
import { ConfirmDialog } from "@/shared/design-system/ConfirmDialog";
import { FormField } from "@/shared/design-system/FormField";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { SCAN_ENABLED } from "@/shared/flags";
import { useT } from "@/shared/i18n";
import { PriceField } from "./PriceField";
import { ProductFormSheet } from "./ProductFormSheet";
import { QrCodeSheet } from "./QrCodeSheet";
import { useAddStock, useProductDetail, useRemoveProductImage, useStockCheck, useSuppliers, useUpdateProduct, useUploadProductImage } from "./api";
import { useRef } from "react";

type Mode = "detail" | "add-stock" | "stock-check" | "edit";

export function ProductDetailSheet({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const detail = useProductDetail(productId);
  const addStock = useAddStock();
  const stockCheck = useStockCheck();
  const update = useUpdateProduct();
  const suppliers = useSuppliers(productId !== null);

  const [mode, setMode] = useState<Mode>("detail");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState<AmountState>(EMPTY_AMOUNT);
  const [paid, setPaid] = useState(true);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState<"COUNTED" | "DAMAGED" | "OTHER" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  if (!productId) return null;
  const product = detail.data?.product;

  function closeAll() {
    setMode("detail");
    setQty("");
    setUnitCost(EMPTY_AMOUNT);
    setPaid(true);
    setSupplierId(null);
    setCounted("");
    setReason(null);
    setConfirmArchive(false);
    onClose();
  }

  async function submitAddStock(p: Product) {
    const quantity = parseInt(qty || "0", 10);
    if (quantity <= 0 || (!paid && !supplierId)) return;
    try {
      await addStock.mutateAsync({
        id: p.id,
        input: { quantity, unit_cost_minor: toMinor(unitCost), paid, supplier_id: supplierId ?? undefined },
      });
      toast.show({ message: t("stock.addedToast", { qty: quantity, name: p.name }) });
      closeAll();
    } catch {
      toast.show({ message: t("error.generic") });
    }
  }

  async function submitStockCheck(p: Product) {
    const value = parseInt(counted || "-1", 10);
    if (value < 0 || !reason) return;
    try {
      const result = await stockCheck.mutateAsync({ id: p.id, input: { counted: value, reason } });
      toast.show({
        message: result.movement
          ? t("stock.checkToastChanged", { name: p.name, count: value })
          : t("stock.checkToastSame"),
      });
      closeAll();
    } catch {
      toast.show({ message: t("error.generic") });
    }
  }

  return (
    <>
      <BottomSheet
        open={mode === "detail"}
        title={product?.name ?? ""}
        onClose={closeAll}
        footer={
          product ? (
            <div className="flex flex-col gap-2">
              <Button
                fullWidth
                data-testid="add-stock"
                onClick={() => {
                  setUnitCost(fromMinor(product.cost_price.amount_minor)); // prefilled from last cost
                  setMode("add-stock");
                }}
              >
                {t("stock.addStock")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button level="secondary" onClick={() => setMode("stock-check")} data-testid="stock-check">
                  {t("stock.stockCheck")}
                </Button>
                <Button level="secondary" onClick={() => setMode("edit")} data-testid="edit-product">
                  {t("stock.editProduct")}
                </Button>
              </div>
              {SCAN_ENABLED ? (
                <Button level="secondary" fullWidth onClick={() => setQrOpen(true)} data-testid="show-qr">
                  {t("scan.showQr")}
                </Button>
              ) : null}
              <Button level="tertiary" fullWidth onClick={() => setConfirmArchive(true)} data-testid="archive-product">
                {t("stock.archive")}
              </Button>
            </div>
          ) : undefined
        }
      >
        {product ? (
          <div className="space-y-3 pb-4">
            <ProductPhotoBlock product={product} />
            <div className="grid grid-cols-2 gap-3">
              <Fact label={t("stock.inStock")} value={`${product.stock} ${product.unit}`} warn={product.low_stock} />
              <Fact label={t("stock.value")} value={product.stock_value.display} />
              <Fact label={t("stock.sellingPrice")} value={product.selling_price.display} />
              <Fact label={t("stock.costPrice")} value={product.cost_price.display} />
            </div>
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
                {t("stock.history")}
              </p>
              <ul className="mt-1 divide-y divide-border rounded-card border border-border bg-surface" data-testid="stock-history">
                {(detail.data?.movements ?? []).map((m) => (
                  <li key={m.id} className="money px-3 py-2 text-sm">
                    {movementSentence(m, t)}
                    <span className="text-text-secondary">
                      {" · "}
                      {new Date(m.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {m.unit_cost ? ` · ${t("stock.mvEach", { cost: m.unit_cost.display })}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      {/* Add stock: quantity + cost + paid/owe-supplier — one action (Phase 2 M4/M6). */}
      <BottomSheet
        open={mode === "add-stock"}
        title={t("stock.addStock")}
        onClose={() => setMode("detail")}
        footer={
          product ? (
            <Button
              fullWidth
              disabled={parseInt(qty || "0", 10) <= 0 || isEmpty(unitCost) || (!paid && !supplierId)}
              loading={addStock.isPending}
              loadingLabel={t("common.save")}
              onClick={() => void submitAddStock(product)}
              data-testid="add-stock-save"
            >
              {t("common.save")}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4 pb-4">
          <FormField
            label={t("stock.qty")}
            value={qty}
            onChange={(v) => setQty(v.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
          />
          <PriceField label={t("stock.unitCost")} value={unitCost} onChange={setUnitCost} testId="unit-cost" />
          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("stock.paidQuestion")}
            </p>
            <div role="radiogroup" aria-label={t("stock.paidQuestion")} className="grid grid-cols-2 gap-2">
              <ToggleOption label={t("stock.paidNow")} selected={paid} onSelect={() => setPaid(true)} testId="stock-paid" />
              <ToggleOption label={t("stock.oweSupplier")} selected={!paid} onSelect={() => setPaid(false)} testId="stock-owe" />
            </div>
            {!paid ? (
              <div className="mt-3">
                <ChipPicker
                  label={t("stock.whichSupplier")}
                  options={(suppliers.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
                  selectedId={supplierId}
                  onSelect={setSupplierId}
                />
              </div>
            ) : null}
          </div>
        </div>
      </BottomSheet>

      {/* Stock check: state reality; MI YONE computes the difference (Phase 5 §31). */}
      <BottomSheet
        open={mode === "stock-check"}
        title={t("stock.stockCheck")}
        onClose={() => setMode("detail")}
        footer={
          product ? (
            <Button
              fullWidth
              disabled={counted === "" || !reason}
              loading={stockCheck.isPending}
              loadingLabel={t("common.save")}
              onClick={() => void submitStockCheck(product)}
              data-testid="stock-check-save"
            >
              {t("common.save")}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4 pb-4">
          <FormField
            label={t("stock.checkQuestion")}
            value={counted}
            onChange={(v) => setCounted(v.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
          />
          <ChipPicker
            label={t("stock.checkReason")}
            options={[
              { id: "COUNTED", label: t("stock.reasonCounted") },
              { id: "DAMAGED", label: t("stock.reasonDamaged") },
              { id: "OTHER", label: t("stock.reasonOther") },
            ]}
            selectedId={reason}
            onSelect={(v) => setReason(v as typeof reason)}
          />
        </div>
      </BottomSheet>

      <ProductFormSheet open={mode === "edit"} product={product ?? null} onClose={() => setMode("detail")} />
      {product ? <QrCodeSheet product={product} open={qrOpen} onClose={() => setQrOpen(false)} /> : null}

      {product ? (
        <ConfirmDialog
          open={confirmArchive}
          title={t("stock.archiveTitle", { name: product.name })}
          body={t("stock.archiveBody")}
          confirmLabel={t("stock.archive")}
          cancelLabel={t("common.cancel")}
          destructive
          onConfirm={() => {
            void update
              .mutateAsync({ id: product.id, input: { archived: true } })
              .then(() => {
                toast.show({ message: t("stock.archivedToast") });
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

function movementSentence(m: StockMovement, t: (id: string, vars?: Record<string, string | number>) => string): string {
  const qty = Math.abs(m.quantity_delta);
  if (m.type === "PURCHASE") return t("stock.mvPurchase", { qty });
  if (m.type === "SALE") return t("stock.mvSale", { qty });
  if (m.type === "DAMAGE") return t("stock.mvDamage", { qty });
  return t("stock.mvAdjust", { qty: `${m.quantity_delta > 0 ? "+" : "−"}${qty}` });
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-card p-3 ${warn ? "bg-warning-fill" : "bg-sunken"}`}>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`money text-base font-semibold ${warn ? "text-warning" : ""}`}>{value}</p>
    </div>
  );
}

function ToggleOption({
  label,
  selected,
  onSelect,
  testId,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={testId}
      className={`flex min-h-[48px] items-center justify-center rounded-input border px-2 text-sm font-semibold transition-colors duration-fast ${
        selected ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}


// Product photo (Photo-to-Product): shown when present; add/change/remove here
// so a failed upload at creation always has a recovery path.
function ProductPhotoBlock({ product }: { product: Product }) {
  const t = useT();
  const toast = useToast();
  const upload = useUploadProductImage();
  const remove = useRemoveProductImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

  function pick(file: File | null) {
    if (!file) return;
    if (!ALLOWED.has(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      toast.show({ message: t(file.size > 5 * 1024 * 1024 ? "stock.photoTooBig" : "stock.photoBadType") });
      return;
    }
    upload.mutate(
      { productId: product.id, file },
      {
        onSuccess: () => toast.show({ message: t("stock.photoSavedToast") }),
        onError: () => toast.show({ message: t("error.generic") }),
      },
    );
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        data-testid="detail-photo-input"
      />
      {product.has_image && product.image_url ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={t("stock.photoOf", { name: product.name })}
            className="h-40 w-full rounded-card border border-border object-cover"
            data-testid="detail-photo"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button level="secondary" onClick={() => fileRef.current?.click()} loading={upload.isPending} loadingLabel={t("stock.changePhoto")} data-testid="detail-photo-change">
              {t("stock.changePhoto")}
            </Button>
            <Button
              level="secondary"
              onClick={() =>
                remove.mutate(product.id, { onSuccess: () => toast.show({ message: t("stock.photoRemoved") }) })
              }
              loading={remove.isPending}
              loadingLabel={t("stock.removePhoto")}
              data-testid="detail-photo-remove"
            >
              {t("stock.removePhoto")}
            </Button>
          </div>
        </div>
      ) : (
        <Button level="secondary" fullWidth onClick={() => fileRef.current?.click()} loading={upload.isPending} loadingLabel={t("stock.addPhoto")} data-testid="detail-photo-add">
          {t("stock.addPhoto")}
        </Button>
      )}
    </div>
  );
}
