"use client";
// Printable QR label sheet (Scan-to-Sell). Deliberately outside the app shell
// so printing produces clean labels — the toolbar hides itself in print.
// Each label: QR + product name (+ unit/SKU) so the owner knows what they stick.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import { encodeProductQr } from "@/shared/qr";
import type { Product } from "@/shared/api/types";
import { SCAN_ENABLED } from "@/shared/flags";
import { useT } from "@/shared/i18n";

function LabelsInner() {
  const t = useT();
  if (!SCAN_ENABLED) {
    return (
      <main className="min-h-dvh bg-white p-6 text-text-primary">
        <p className="text-base font-semibold">{t("scan.comingSoon")}</p>
        <Link href="/stock" className="mt-3 inline-block text-sm font-semibold underline">
          {t("common.back")}
        </Link>
      </main>
    );
  }
  const params = useSearchParams();
  const only = params.get("only");
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>(`/businesses/${BUSINESS_ID}/products`),
  });

  const rows = (products.data ?? []).filter((p) => !p.archived && (!only || p.id === only));
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const p of rows) {
        next[p.id] = await QRCode.toDataURL(encodeProductQr(p.id), { width: 320, margin: 2 });
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, only]);

  return (
    <main className="min-h-dvh bg-white p-6 text-text-primary">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold">{t("scan.printSheetTitle")}</h1>
          <p className="text-sm text-text-secondary">{t("scan.labelsHint")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stock" className="flex min-h-[44px] items-center rounded-input border border-border px-4 text-sm font-semibold">
            {t("common.back")}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="labels-print"
            className="flex min-h-[44px] items-center rounded-input bg-action px-4 text-sm font-semibold text-text-inverse"
          >
            {t("scan.print")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3" data-testid="labels-grid">
        {rows.map((p) => (
          <div key={p.id} className="break-inside-avoid rounded-card border border-border p-3 text-center" data-testid="label-card">
            {urls[p.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p.id]} alt={`${p.name} QR`} className="mx-auto h-32 w-32" />
            ) : (
              <div className="mx-auto h-32 w-32 rounded bg-sunken" />
            )}
            <p className="mt-1 truncate text-sm font-semibold">{p.name}</p>
            <p className="truncate text-xs text-text-secondary">
              {[p.unit, p.sku].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function LabelsPage() {
  return (
    <Suspense>
      <LabelsInner />
    </Suspense>
  );
}
