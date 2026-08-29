"use client";
// Product QR (Scan-to-Sell). The code carries only the opaque product
// reference (see shared/qr.ts) — no price, no business data. Rendered locally
// with the `qrcode` library (stated dependency reason: QR encoding is a spec
// best not hand-rolled; tiny, offline, identical in mock and real modes).
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { encodeProductQr } from "@/shared/qr";
import type { Product } from "@/shared/api/types";
import { useT } from "@/shared/i18n";

export function QrCodeSheet({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void QRCode.toDataURL(encodeProductQr(product.id), { width: 480, margin: 2 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, product.id]);

  return (
    <BottomSheet open={open} title={t("scan.qrTitle")} onClose={onClose}>
      <div className="space-y-3 pb-4 text-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`${product.name} QR`} className="mx-auto h-56 w-56 rounded-card border border-border bg-white" data-testid="product-qr" />
        ) : null}
        <p className="text-base font-semibold">{product.name}</p>
        <p className="text-sm text-text-secondary">{t("scan.qrHint")}</p>
        <Link
          href={`/labels?only=${product.id}`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-input border-[1.5px] border-brand px-4 text-base font-semibold text-brand"
          data-testid="qr-print-single"
        >
          {t("scan.printLabels")}
        </Link>
      </div>
    </BottomSheet>
  );
}
