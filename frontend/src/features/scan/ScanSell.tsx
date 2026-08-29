"use client";
// Scan-to-Sell (hackathon MVP): Scan → cart builds → adjust → Finish sale.
// The cart's running total is display assistance only — the SERVER computes and
// validates the final total and stock through the existing sale primitives (one
// idempotency key per checkout, generated when this screen opens). Duplicate
// scanner frames are debounced; a deliberate rescan of the same product adds one.
import { useCallback, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useToast } from "@/shared/design-system/Toast";
import { Button } from "@/shared/design-system/Button";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { isDomainError } from "@/shared/api/client";
import { decodeQr } from "@/shared/qr";
import type { Product } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { useCheckout, useScanProducts } from "./api";
import { useScanner } from "./useScanner";

interface CartRow {
  productId: string;
  quantity: number;
}

const DEBOUNCE_MS = 1500;

export function ScanSell() {
  const t = useT();
  const toast = useToast();
  const products = useScanProducts();
  const checkout = useCheckout();

  const [cart, setCart] = useState<CartRow[]>([]);
  // One logical sale per screen visit: retries/double-taps replay, never duplicate.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [scanNote, setScanNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const byId = (pid: string) => (products.data ?? []).find((p) => p.id === pid);

  const addProduct = useCallback(
    (product: Product) => {
      if (product.track_inventory && product.stock <= 0) {
        setScanNote({ tone: "warn", text: t("scan.outOfStock", { name: product.name }) });
        return;
      }
      setCart((prev) => {
        const existing = prev.find((r) => r.productId === product.id);
        if (existing) return prev.map((r) => (r.productId === product.id ? { ...r, quantity: r.quantity + 1 } : r));
        return [...prev, { productId: product.id, quantity: 1 }];
      });
      setScanNote({ tone: "ok", text: t("scan.added", { name: product.name }) });
    },
    [t],
  );

  const onCode = useCallback(
    (raw: string) => {
      const now = Date.now();
      // Repeated frames of the same code are one scan; a later rescan is +1.
      if (raw === lastScan.current.code && now - lastScan.current.at < DEBOUNCE_MS) return;
      lastScan.current = { code: raw, at: now };
      const decoded = decodeQr(raw);
      if (decoded.kind !== "product") {
        setScanNote({ tone: "warn", text: t("scan.notMiyoneCode") });
        return;
      }
      const product = (products.data ?? []).find((p) => p.id === decoded.productId);
      if (!product) {
        setScanNote({ tone: "warn", text: t("scan.unknownProduct") });
        return;
      }
      addProduct(product);
    },
    [products.data, addProduct, t],
  );

  const scanner = useScanner(true, onCode);

  const setQty = (pid: string, qty: number) =>
    setCart((prev) => prev.map((r) => (r.productId === pid ? { ...r, quantity: Math.max(1, qty) } : r)));
  const remove = (pid: string) => setCart((prev) => prev.filter((r) => r.productId !== pid));

  // Display-only running total (grouping of server prices × qty); the server
  // recomputes the real total at confirm.
  const subtotalMinor = cart.reduce((a, r) => a + (byId(r.productId)?.selling_price.amount_minor ?? 0) * r.quantity, 0);
  const group = (n: number) => String(Math.round(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  async function confirm() {
    if (cart.length === 0 || checkout.isPending) return;
    setServerError(null);
    try {
      const result = await checkout.mutateAsync({
        items: cart.map((r) => ({ product_id: r.productId, quantity: r.quantity })),
        idempotencyKey,
      });
      toast.show({
        message: t("scan.savedToast", { total: result.total.display, count: String(cart.reduce((a, r) => a + r.quantity, 0)) }),
      });
      setCart([]);
      setScanNote(null);
      setIdempotencyKey(crypto.randomUUID()); // ready for the next customer
    } catch (e) {
      setServerError(isDomainError(e) ? (e.serverMessage ?? t(e.messageId)) : t("error.generic"));
    }
  }

  return (
    <div className="space-y-4 pt-2 pb-4">
      <h1 className="text-xl font-bold">{t("scan.title")}</h1>

      {/* Camera viewport, or the honest fallback when scanning isn't possible. */}
      {scanner.state === "unsupported" || scanner.state === "denied" ? (
        <p role="status" className="rounded-card bg-warning-fill px-3 py-2 text-sm font-medium" data-testid="scan-fallback-note">
          {t(scanner.state === "denied" ? "scan.cameraDenied" : "scan.cameraUnsupported")}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-card border border-border bg-sunken">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={scanner.videoRef} className="h-48 w-full object-cover" muted playsInline data-testid="scan-video" />
          <p className="absolute inset-x-0 bottom-0 bg-surface/90 px-3 py-1.5 text-center text-xs font-medium text-text-secondary">
            {t(scanner.state === "starting" ? "scan.cameraStarting" : "scan.pointCamera")}
          </p>
        </div>
      )}

      {scanNote ? (
        <p
          role="status"
          data-testid="scan-note"
          className={`rounded-card px-3 py-2 text-sm font-medium ${scanNote.tone === "ok" ? "bg-money-in-tint text-money-in" : "bg-warning-fill text-text-primary"}`}
        >
          {scanNote.text}
        </p>
      ) : null}

      {/* Tap-to-add — the always-available path (and the fallback when the camera can't scan). */}
      <div>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("scan.tapFallbackLabel")}</p>
        <div className="-mx-4 overflow-x-auto px-4" tabIndex={0} role="group" aria-label={t("scan.tapFallbackLabel")}>
          <div className="flex min-w-max gap-2">
            {products.isPending ? (
              <SkeletonList rows={1} />
            ) : (
              (products.data ?? [])
                .filter((p) => !p.archived)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    data-testid="scan-tap-product"
                    className="min-h-[44px] shrink-0 rounded-pill border border-border bg-surface px-3 text-sm font-medium active:bg-brand-tint"
                  >
                    {p.name}
                  </button>
                ))
            )}
          </div>
        </div>
      </div>

      {/* The sale being built. */}
      <section aria-label={t("scan.cartTitle")}>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("scan.cartTitle")}</p>
        {cart.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-text-secondary">{t("scan.cartEmpty")}</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {cart.map((row) => {
              const p = byId(row.productId);
              if (!p) return null;
              return (
                <div key={row.productId} className="flex items-center gap-2 bg-surface px-3 py-2" data-testid="scan-cart-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="money text-xs text-text-secondary">{p.selling_price.display}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="−"
                      onClick={() => setQty(row.productId, row.quantity - 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-input bg-sunken"
                    >
                      <Minus size={14} aria-hidden />
                    </button>
                    <span className="tabular w-7 text-center text-sm font-semibold" data-testid="scan-qty">
                      {row.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="+"
                      onClick={() => setQty(row.productId, row.quantity + 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-input bg-sunken"
                    >
                      <Plus size={14} aria-hidden />
                    </button>
                  </div>
                  <span className="money w-24 text-right text-sm font-semibold">
                    Le {group(p.selling_price.amount_minor * row.quantity)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("scan.removeItem", { name: p.name })}
                    onClick={() => remove(row.productId)}
                    data-testid="scan-remove"
                    className="flex h-10 w-10 items-center justify-center rounded-input text-text-secondary active:bg-sunken"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {serverError ? (
        <p role="alert" className="rounded-card bg-danger-fill px-3 py-2 text-sm font-medium text-danger" data-testid="scan-server-error">
          {serverError}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text-secondary">{t("scan.subtotal")}</span>
          <span className="money text-xl font-bold" data-testid="scan-subtotal">
            Le {group(subtotalMinor)}
          </span>
        </div>
        <p className="text-xs text-text-secondary">{t("scan.serverNote")}</p>
        <Button
          fullWidth
          disabled={cart.length === 0}
          loading={checkout.isPending}
          loadingLabel={t("scan.confirm")}
          onClick={() => void confirm()}
          data-testid="scan-confirm"
        >
          {t("scan.confirm")}
        </Button>
      </div>
    </div>
  );
}
