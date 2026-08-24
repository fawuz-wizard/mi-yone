"use client";
// Create/edit product (Phase 4 §19). Name + selling price required; everything
// else optional — no setup homework (Phase 3 rule).
import { useEffect, useState } from "react";
import type { Product } from "@/shared/api/types";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { FormField } from "@/shared/design-system/FormField";
import { useToast } from "@/shared/design-system/Toast";
import { EMPTY_AMOUNT, fromMinor, isEmpty, toMinor, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";
import { PriceField } from "./PriceField";
import { useCreateProduct, useUpdateProduct } from "./api";

export function ProductFormSheet({
  open,
  product, // null = create
  onClose,
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [selling, setSelling] = useState<AmountState>(EMPTY_AMOUNT);
  const [cost, setCost] = useState<AmountState>(EMPTY_AMOUNT);
  const [threshold, setThreshold] = useState("5");
  const [initialStock, setInitialStock] = useState("");

  useEffect(() => {
    if (open) {
      setName(product?.name ?? "");
      setUnit(product?.unit ?? "");
      setSelling(product ? fromMinor(product.selling_price.amount_minor) : EMPTY_AMOUNT);
      setCost(product ? fromMinor(product.cost_price.amount_minor) : EMPTY_AMOUNT);
      setThreshold(String(product?.low_stock_threshold ?? 5));
      setInitialStock("");
    }
  }, [open, product]);

  const valid = name.trim().length > 0 && !isEmpty(selling);

  async function submit() {
    try {
      if (product) {
        await update.mutateAsync({
          id: product.id,
          input: {
            name: name.trim(),
            unit: unit.trim() || undefined,
            selling_price_minor: toMinor(selling),
            cost_price_minor: toMinor(cost),
            low_stock_threshold: Math.max(0, parseInt(threshold || "0", 10) || 0),
          },
        });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          unit: unit.trim() || undefined,
          selling_price_minor: toMinor(selling),
          cost_price_minor: toMinor(cost) || undefined,
          low_stock_threshold: Math.max(0, parseInt(threshold || "5", 10) || 5),
          initial_stock: Math.max(0, parseInt(initialStock || "0", 10) || 0) || undefined,
        });
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
      dirty={name.trim().length > 0 && !product}
      footer={
        <Button
          fullWidth
          disabled={!valid}
          loading={create.isPending || update.isPending}
          loadingLabel={t("common.save")}
          onClick={() => void submit()}
          data-testid="product-save"
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="space-y-4 pb-4">
        <FormField label={t("stock.name")} value={name} onChange={setName} />
        <PriceField label={t("stock.sellingPrice")} value={selling} onChange={setSelling} testId="price-selling" />
        <PriceField label={t("stock.costPrice")} value={cost} onChange={setCost} testId="price-cost" />
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
