"use client";
// Stock (Phase 4 §19 / Phase 5 5F): "What do I have and what's running low?"
// Low-stock first, amber badge + the word "Low" (never color alone).
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, QrCode } from "lucide-react";
import { useProducts } from "@/features/capture/api";
import { ProductDetailSheet } from "@/features/stock/ProductDetailSheet";
import { ProductFormSheet } from "@/features/stock/ProductFormSheet";
import { WhatsAppImportSheet } from "@/features/stock/WhatsAppImportSheet";
import { Button } from "@/shared/design-system/Button";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { SearchField } from "@/shared/design-system/SearchField";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { SCAN_ENABLED } from "@/shared/flags";
import { useT } from "@/shared/i18n";

export default function StockPage() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const products = useProducts(true);

  const rows = useMemo(
    () => (products.data ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [products.data, query],
  );

  return (
    <div className="space-y-4 pt-2">
      <h1 className="sr-only">{t("stock.question")}</h1>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} />
        </div>
        <Button level="secondary" onClick={() => setCreating(true)} data-testid="new-product">
          <Plus size={16} aria-hidden /> {t("stock.addProduct")}
        </Button>
        <Button level="secondary" onClick={() => setImporting(true)} data-testid="wa-open">
          {t("wa.entry")}
        </Button>
        {SCAN_ENABLED ? (
        <Link
          href="/labels"
          aria-label={t("scan.printLabels")}
          data-testid="labels-open"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input border-[1.5px] border-brand text-brand"
        >
          <QrCode size={18} aria-hidden />
        </Link>
        ) : null}
      </div>

      <WhatsAppImportSheet open={importing} onClose={() => setImporting(false)} />

      {products.isPending ? (
        <SkeletonList rows={4} />
      ) : (products.data ?? []).length === 0 ? (
        <EmptyState
          title={t("stock.emptyTitle")}
          body=""
          action={
            <Button fullWidth onClick={() => setCreating(true)}>
              {t("stock.emptyAction")}
            </Button>
          }
          secondary={t("stock.emptyEscape")}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              data-testid="product-row"
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast active:bg-sunken"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{p.name}</span>
                <span className="money block text-sm text-text-secondary">{p.selling_price.display}</span>
              </span>
              {p.low_stock ? (
                <span className="rounded-pill bg-warning-fill px-2 py-0.5 text-[13px] font-bold text-warning">
                  {t("stock.low")} · {t("stock.left", { count: p.stock })}
                </span>
              ) : (
                <span className="money text-sm font-semibold text-text-secondary">
                  {t("stock.left", { count: p.stock })}
                </span>
              )}
            </button>
          ))}
          {rows.length === 0 ? (
            <p className="bg-surface px-4 py-4 text-sm text-text-secondary">{t("money.searchNoResults")}</p>
          ) : null}
        </div>
      )}

      <ProductDetailSheet productId={selectedId} onClose={() => setSelectedId(null)} />
      <ProductFormSheet open={creating} product={null} existingProducts={products.data ?? []} onClose={() => setCreating(false)} />
    </div>
  );
}
