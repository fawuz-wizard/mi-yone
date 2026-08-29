"use client";
// Partner — the business companion. Every reply is phrased from VERIFIED
// figures computed by the deterministic services (the AI is never the source
// of truth), and each carries its provenance line. Read-only over records.
import { useEffect, useRef, useState } from "react";
import { useT } from "@/shared/i18n";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import type { PartnerMessage } from "@/shared/api/types";
import { useAskPartner, usePartnerHistory } from "./api";

const SUGGESTION_IDS = ["partner.suggest1", "partner.suggest2", "partner.suggest3", "partner.suggest4"] as const;

export function PartnerChat() {
  const t = useT();
  const history = usePartnerHistory();
  const ask = useAskPartner();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const messages = history.data?.messages ?? [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, ask.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    setDraft("");
    ask.mutate(trimmed);
  };

  if (history.isPending) {
    return (
      <div className="pt-2">
        <SkeletonList rows={3} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-160px)] flex-col pt-2">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-base font-semibold">{t("partner.emptyTitle")}</p>
            <p className="mt-1 text-sm text-text-secondary">{t("partner.emptyBody")}</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {ask.isPending ? (
          <div className="max-w-[85%] rounded-card border border-border bg-surface px-3 py-2" data-testid="partner-thinking">
            <p className="text-sm text-text-secondary">{t("partner.thinking")}</p>
          </div>
        ) : null}
        {ask.isError ? (
          <p role="alert" className="rounded-card bg-danger-fill px-3 py-2 text-sm font-medium text-danger">
            {t("partner.askFailed")}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Suggested questions — one tap to a grounded answer. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2" tabIndex={0} role="group" aria-label={t("partner.question")}>
        <div className="flex min-w-max gap-2">
          {SUGGESTION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => send(t(id))}
              disabled={ask.isPending}
              data-testid="partner-suggestion"
              className="min-h-[40px] shrink-0 rounded-pill border border-border bg-surface px-3 text-sm font-medium text-text-primary active:bg-sunken disabled:opacity-40"
            >
              {t(id)}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex gap-2 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("partner.inputPlaceholder")}
          maxLength={500}
          data-testid="partner-input"
          className="min-h-[48px] w-full min-w-0 flex-1 rounded-input border border-border-input bg-surface px-3 text-base placeholder:text-text-secondary"
        />
        <button
          type="submit"
          disabled={!draft.trim() || ask.isPending}
          data-testid="partner-send"
          className="min-h-[48px] shrink-0 rounded-input bg-action px-4 text-base font-semibold text-text-inverse disabled:opacity-40"
        >
          {t("partner.send")}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: PartnerMessage }) {
  const t = useT();
  if (message.role === "owner") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-card bg-brand-tint px-3 py-2 text-sm font-medium text-text-primary" data-testid="partner-msg-owner">
          {message.text}
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-[92%]" data-testid="partner-msg-reply">
      <div className="money whitespace-pre-line rounded-card border border-border bg-surface px-3 py-2 text-sm text-text-primary">
        {message.text}
      </div>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{t("partner.fromRecords")}</p>
    </div>
  );
}
