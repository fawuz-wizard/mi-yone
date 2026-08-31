"use client";
// Scan-to-Sell (QR MVP) — multi-product checkout in seconds.
// LOCKED by default while the product is with testers (owner decision):
// enable with NEXT_PUBLIC_MIYONE_SCAN=on. See shared/flags.ts.
import Link from "next/link";
import { ScanSell } from "@/features/scan/ScanSell";
import { EmptyState } from "@/shared/design-system/EmptyState";
import { SCAN_ENABLED } from "@/shared/flags";
import { useT } from "@/shared/i18n";

export default function ScanPage() {
  const t = useT();
  if (!SCAN_ENABLED) {
    return (
      <div className="pt-4">
        <EmptyState
          title={t("scan.comingSoon")}
          body={t("scan.lockedBody")}
          action={
            <Link
              href="/home"
              className="flex min-h-[48px] w-full items-center justify-center rounded-input bg-action text-base font-semibold text-text-inverse"
            >
              {t("common.back")}
            </Link>
          }
        />
      </div>
    );
  }
  return <ScanSell />;
}
