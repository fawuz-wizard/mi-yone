// EmptyState (Phase 4 §13/§25): what this is · why it matters · ONE primary action.
import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
  secondary,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-10 text-center">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="max-w-[36ch] text-base text-text-secondary">{body}</p>
      {action ? <div className="mt-2 w-full max-w-[280px]">{action}</div> : null}
      {secondary ? <div className="text-sm text-text-secondary">{secondary}</div> : null}
    </div>
  );
}
