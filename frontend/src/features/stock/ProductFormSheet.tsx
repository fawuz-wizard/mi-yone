"use client";
// Create/edit product (Phase 4 §19) + Photo-to-Product. Name + selling price
// required; everything else optional — no setup homework (Phase 3 rule).
// Photo flow: take/choose photo → preview (replace/remove) → AI suggestions
// when the AI provider is configured (name/category/description only — NEVER
// a price; the owner sets the price) → save → image uploads after creation.
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, TriangleAlert, X } from "lucide-react";
import type { PhotoSuggestions, Product } from "@/shared/api/types";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { FormField } from "@/shared/design-system/FormField";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";
import { PriceField } from "./PriceField";
import { useCreateProduct, useSuggestFromPhoto, useUpdateProduct, useUploadProductImage } from "./api";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d/.test(w)),
  );
}

export function ProductFormSheet({
  open,
  product, // null = create
  existingProducts = [],
  onClose,
}: {
  open: boolean;
  product: Product | null;
  existingProducts?: Product[];
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const uploadImage = useUploadProductImage();
  const suggest = useSuggestFromPhoto();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [selling, setSelling] = useState<AmountState>(EMPTY_AMOUNT);
  const [cost, setCost] = useState<AmountState>(EMPTY_AMOUNT);
  const [threshold, setThreshold] = useState("5");
  const [initialStock, setInitialStock] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PhotoSuggestions | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(product?.name ?? "");
      setUnit(product?.unit ?? "");
      setSelling(product ? fromMinor(product.selling_price.amount_minor) : EMPTY_AMOUNT);
      setCost(product ? fromMinor(product.cost_price.amount_minor) : EMPTY_AMOUNT);
      setThreshold(String(product?.low_stock_threshold ?? 5));
      setInitialStock("");
      setCategory(product?.category ?? "");
      setDescription(product?.description ?? "");
      setSku(product?.sku ?? "");
      setPhoto(null);
      setPhotoError(null);
      setSuggestions(null);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open, product]);

  function pickPhoto(file: File | null) {
    setPhotoError(null);
    setSuggestions(null);
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setPhotoError(t("stock.photoBadType"));
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      setPhotoError(t("stock.photoTooBig"));
      return;
    }
    setPhoto(file);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    // AI suggestions when the provider is configured — honestly absent otherwise.
    suggest.mutate(file, { onSuccess: (s) => setSuggestions(s.available ? s : null) });
  }

  function removePhoto() {
    setPhoto(null);
    setSuggestions(null);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  const valid = name.trim().length > 0 && !isEmpty(selling);

  // Obvious-duplicate check against the business's own products (advisory —
  // the owner decides; same pattern as the WhatsApp import review).
  const dupTokens = nameTokens(name);
  const duplicate =
    !product && name.trim().length >= 3
      ? existingProducts.find((p) => [...nameTokens(p.name)].some((tk) => dupTokens.has(tk))) ?? null
      : null;

  async function submit() {
    try {
      let productId = product?.id ?? null;
      const extras = {
        description: description.trim() || undefined,
        sku: sku.trim() || undefined,
        category: category.trim() || undefined,
      };
      if (product) {
        await update.mutateAsync({
          id: product.id,
          input: {
            name: name.trim(),
            unit: unit.trim() || undefined,
            selling_price_minor: toMinor(selling),
            cost_price_minor: toMinor(cost),
            low_stock_threshold: Math.max(0, parseInt(threshold || "0", 10) || 0),
            ...extras,
          },
        });
      } else {
        const created = await create.mutateAsync({
          name: name.trim(),
          unit: unit.trim() || undefined,
          selling_price_minor: toMinor(selling),
          cost_price_minor: toMinor(cost) || undefined,
          low_stock_threshold: Math.max(0, parseInt(threshold || "5", 10) || 5),
          initial_stock: Math.max(0, parseInt(initialStock || "0", 10) || 0) || undefined,
          ...extras,
        });
        productId = created.id;
      }
      // Image uploads after the record exists; a failed upload never loses the product.
      if (photo && productId) {
        try {
          await uploadImage.mutateAsync({ productId, file: photo });
        } catch {
          toast.show({ message: t("stock.photoUploadFailed"), tone: "pending" });
          onClose();
          return;
        }
      }
      toast.show({ message: t("stock.productSaved") });
      onClose();
    } catch {
      toast.show({ message: t("error.generic") });
    }
  }

  return (
    <BottomSheet
      open={open}
      title={product ? t("stock.editProduct") : t("stock.addProduct")}
      onClose={onClose}
      dirty={(name.trim().length > 0 || photo !== null) && !product}
      footer={
        <Button
          fullWidth
          disabled={!valid}
          loading={create.isPending || update.isPending || uploadImage.isPending}
          loadingLabel={t("common.save")}
          onClick={() => void submit()}
          data-testid="product-save"
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="space-y-4 pb-4">
        {/* Photo first — the fastest way to add a product while the shop is busy. */}
        {!product ? (
          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("stock.photoSection")}
            </p>
            <input
              ref={cameraRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              data-testid="photo-camera-input"
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              data-testid="photo-gallery-input"
            />
            {photoUrl ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt={t("stock.photoPreviewAlt")}
                  className="h-40 w-full rounded-card border border-border object-cover"
                  data-testid="photo-preview"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button level="secondary" onClick={() => galleryRef.current?.click()} data-testid="photo-replace">
                    {t("stock.replacePhoto")}
                  </Button>
                  <Button level="secondary" onClick={removePhoto} data-testid="photo-remove">
                    <X size={16} aria-hidden /> {t("stock.removePhoto")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button level="secondary" onClick={() => cameraRef.current?.click()} data-testid="photo-take">
                  <Camera size={16} aria-hidden /> {t("stock.takePhoto")}
                </Button>
                <Button level="secondary" onClick={() => galleryRef.current?.click()} data-testid="photo-choose">
                  <ImagePlus size={16} aria-hidden /> {t("stock.choosePhoto")}
                </Button>
              </div>
            )}
            {photoError ? (
              <p role="alert" className="mt-2 text-sm font-medium text-danger" data-testid="photo-error">
                {photoError}
              </p>
            ) : null}
            {suggest.isPending ? (
              <p role="status" className="mt-2 text-sm text-text-secondary">
                {t("stock.photoLooking")}
              </p>
            ) : null}
            {suggestions ? (
              <div className="mt-2 rounded-card bg-sunken p-3" data-testid="photo-suggestions">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t("stock.suggestTitle")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.name ? (
                    <SuggestChip label={suggestions.name} onUse={() => setName(suggestions.name ?? "")} />
                  ) : null}
                  {suggestions.category ? (
                    <SuggestChip label={suggestions.category} onUse={() => setCategory(suggestions.category ?? "")} />
                  ) : null}
                  {suggestions.description ? (
                    <SuggestChip label={suggestions.description} onUse={() => setDescription(suggestions.description ?? "")} />
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-text-secondary">{t("stock.suggestNote")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <FormField label={t("stock.name")} value={name} onChange={setName} />
        {duplicate ? (
          <p className="flex items-start gap-1.5 rounded-card bg-warning-fill px-2 py-1.5 text-xs font-medium" data-testid="product-dup-warn" role="alert">
            <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            {t("wa.duplicateWarn", { name: duplicate.name })}
          </p>
        ) : null}
        <PriceField label={t("stock.sellingPrice")} value={selling} onChange={setSelling} testId="price-selling" />
        <PriceField label={t("stock.costPrice")} value={cost} onChange={setCost} testId="price-cost" />
        <FormField label={t("stock.categoryLabel")} value={category} onChange={setCategory} optional />
        <FormField label={t("stock.description")} value={description} onChange={setDescription} optional />
        <FormField label={t("stock.sku")} value={sku} onChange={setSku} optional />
        <FormField label={t("stock.unit")} value={unit} onChange={setUnit} optional />
        <FormField
          label={t("stock.threshold")}
          value={threshold}
          onChange={(v) => setThreshold(v.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
        />
        {!product ? (
          <FormField
            label={t("stock.initialStock")}
            value={initialStock}
            onChange={(v) => setInitialStock(v.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            optional
          />
        ) : null}
      </div>
    </BottomSheet>
  );
}

function SuggestChip({ label, onUse }: { label: string; onUse: () => void }) {
  return (
    <button
      type="button"
      onClick={onUse}
      className="min-h-[36px] max-w-full truncate rounded-pill border border-border bg-surface px-3 text-sm font-medium text-text-primary active:bg-brand-tint"
      data-testid="photo-suggest-chip"
    >
      {label}
    </button>
  );
}
