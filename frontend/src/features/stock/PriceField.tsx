"use client";
// A money field that opens the AmountKeypad in a sheet — money entry never
// depends on the OS keyboard (Phase 5 §11/§15), even in setup forms.
import { useState } from "react";
import { AmountKeypad } from "@/shared/design-system/AmountKeypad";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { toDisplay, type AmountState } from "@/shared/design-system/amount";
import { useT } from "@/shared/i18n";

export function PriceField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: AmountState;
  onChange: (v: AmountState) => void;
  testId?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(true)}
        className="money flex min-h-[48px] w-full items-center justify-between rounded-input border border-border-input bg-surface px-3 text-base"
      >
        <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
        <span className="font-semibold">Le {toDisplay(value)}</span>
      </button>
      <BottomSheet
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        footer={
          <Button fullWidth onClick={() => setOpen(false)} data-testid={testId ? `${testId}-done` : undefined}>
            {t("common.save")}
          </Button>
        }
      >
        <div className="pb-4">
          <AmountKeypad value={value} onChange={onChange} />
        </div>
      </BottomSheet>
    </>
  );
}
