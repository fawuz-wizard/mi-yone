"use client";
// Help & support — real answers about the product as it exists. No fake
// support infrastructure: contact goes to the team mailbox.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/shared/i18n";

const SUPPORT_EMAIL = "jfawuz@gmail.com"; // MI YONE team — replace at launch

export default function HelpPage() {
  const t = useT();
  const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: t(`help.q${n}`), a: t(`help.a${n}`) }));
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-xl font-bold">{t("help.title")}</h1>
      <div className="divide-y divide-border rounded-card border border-border bg-surface">
        {faqs.map((f, i) => (
          <div key={f.q}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              aria-expanded={openIdx === i}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-base font-semibold">{f.q}</span>
              <ChevronDown aria-hidden size={18} className={`shrink-0 text-text-secondary transition-transform duration-fast ${openIdx === i ? "rotate-180" : ""}`} />
            </button>
            {openIdx === i ? <p className="px-4 pb-3 text-sm text-text-secondary">{f.a}</p> : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <a href={`mailto:${SUPPORT_EMAIL}?subject=MI YONE support`} className="flex min-h-[52px] items-center justify-center rounded-card border border-border bg-surface text-base font-semibold" data-testid="help-contact">
          {t("help.contact")}
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=MI YONE problem report`} className="flex min-h-[52px] items-center justify-center rounded-card border border-border bg-surface text-base font-semibold" data-testid="help-report">
          {t("help.report")}
        </a>
      </div>
    </div>
  );
}
