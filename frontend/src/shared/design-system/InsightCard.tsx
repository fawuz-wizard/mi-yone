"use client";
// InsightCard (Phase 4 §23 / Phase 5 §35): fact · figure · provenance · one action.
// The only AI markers in the product: 3px clay edge + compass. Calm by law.
import Link from "next/link";
import { Compass } from "lucide-react";
import type { Insight } from "@/shared/api/types";

export function InsightCard({ insight, provenanceLabel }: { insight: Insight; provenanceLabel: string }) {
  return (
    <section
      aria-label={insight.statement}
      className="rounded-card border border-border border-l-[3px] border-l-brand bg-surface p-4"
    >
      <div className="flex items-start gap-2">
        <Compass aria-hidden size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-brand" />
        <div>
          <h3 className="text-[17px] font-semibold">{insight.statement}</h3>
          <p className="money mt-1 text-base font-semibold">{insight.figure}</p>
          <p className="text-sm text-text-secondary">{insight.context}</p>
          <p className="mt-2 inline-block rounded-pill bg-brand-tint px-2 py-0.5 text-[13px] font-semibold text-brand">
            {provenanceLabel}
          </p>
          <div className="mt-2">
            <Link href={insight.action_target} className="text-sm font-semibold text-brand underline-offset-2">
              {insight.action_label} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
