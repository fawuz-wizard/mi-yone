// ListSection (Phase 4 §13): date-grouped list scaffold with sticky caption header.
import type { ReactNode } from "react";

export function ListSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 bg-background px-4 py-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
        {heading}
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}
