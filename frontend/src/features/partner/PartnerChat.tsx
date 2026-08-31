"use client";
// Partner — the business companion, with three kinds of knowledge and no
// blending between them (design spec §22–24, owner advisor brief):
//   records  — VERIFIED figures computed by the deterministic services
//   guidance — curated business practice, written by people, rendered verbatim
//   web      — market research, only ever shown with its sources and date
// Every block on screen carries its own label, so the owner always knows
// whether they are looking at their business or at the outside world.
import { useEffect, useRef, useState } from "react";
import { Globe, Mic, Square, Store } from "lucide-react";
import { useT } from "@/shared/i18n";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { speechCtor, type SpeechRecognitionLike } from "@/shared/speech";
import type { PartnerBlock, PartnerMessage } from "@/shared/api/types";
import { useAskPartner, usePartnerHistory } from "./api";

const BUSINESS_SUGGESTIONS = ["partner.suggest1", "partner.suggest2", "partner.suggest3", "partner.suggest4"] as const;
const ADVISOR_SUGGESTIONS = ["partner.suggest5", "partner.suggest6", "partner.suggest7"] as const;

type Mode = "business" | "research";

export function PartnerChat() {
  const t = useT();
  const history = usePartnerHistory();
  const ask = useAskPartner();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("business");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = history.data?.messages ?? [];
  const researchAvailable = history.data?.research_available ?? false;

  // Detect mic support after mount only (SSR renders without it → no mismatch).
  useEffect(() => setMicSupported(speechCtor() !== null), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, ask.isPending]);
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    setDraft("");
    recognitionRef.current?.stop();
    // "auto" lets the deterministic router read the question; the toggle is an
    // explicit override for when the owner knows they want the outside world.
    ask.mutate({ text: trimmed, mode: mode === "research" ? "research" : "auto" });
  };

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      setMicMessage(t("partner.micUnsupported"));
      return;
    }
    const recognition = new Ctor();
    // Krio and Sierra Leonean English both come through the en-GB model; the
    // Partner normalizes Krio itself, so whatever the browser hears is usable.
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) text += e.results[i][0].transcript;
      setDraft(text.trim());
    };
    recognition.onerror = () => setMicMessage(t("partner.micUnsupported"));
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setMicMessage(null);
    setListening(true);
    recognition.start();
  };

  if (history.isPending) {
    return (
      <div className="pt-2">
        <SkeletonList rows={3} />
      </div>
    );
  }

  const suggestions = mode === "business" ? [...BUSINESS_SUGGESTIONS, ...ADVISOR_SUGGESTIONS] : [];

  return (
    <div className="flex h-[calc(100dvh-160px)] flex-col pt-2">
      {/* Mode toggle (design spec §22.3) — an explicit choice, never a guess. */}
      <div className="mb-3 flex items-center gap-2" role="group" aria-label={t("partner.modeLabel")}>
        <ModeButton
          active={mode === "business"}
          onClick={() => setMode("business")}
          icon={Store}
          label={t("partner.modeBusiness")}
          testId="partner-mode-business"
        />
        <ModeButton
          active={mode === "research"}
          onClick={() => setMode("research")}
          icon={Globe}
          label={t("partner.modeWeb")}
          testId="partner-mode-web"
          info
        />
      </div>

      {mode === "research" && !researchAvailable ? (
        <div className="mb-3 rounded-card border-l-[3px] border-l-info border border-border bg-info-fill p-3" data-testid="research-unavailable">
          <p className="text-sm font-semibold text-text-primary">{t("partner.researchOffTitle")}</p>
          <p className="mt-1 text-sm text-text-secondary">{t("partner.researchOffBody")}</p>
        </div>
      ) : null}

      {/* The transcript scrolls, so it must be reachable and scrollable by
          keyboard alone — an answer a mouse user can read is an answer a
          keyboard user must be able to read too. */}
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        aria-live="polite"
        role="log"
        tabIndex={0}
        aria-label={t("partner.question")}
      >
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
            <p className="text-sm text-text-secondary">{t(mode === "research" ? "partner.thinkingWeb" : "partner.thinking")}</p>
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
      {suggestions.length > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2" tabIndex={0} role="group" aria-label={t("partner.question")}>
          <div className="flex min-w-max gap-2">
            {suggestions.map((id) => (
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
      ) : null}

      {micMessage ? (
        <p role="status" className="pb-2 text-sm text-text-secondary">
          {micMessage}
        </p>
      ) : null}

      {/* The global + button floats over the bottom-right of every screen, so
          the composer keeps clear of it rather than hiding its own Ask button. */}
      <form
        className="flex gap-2 pb-2 pr-[68px]"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(mode === "research" ? "partner.inputPlaceholderWeb" : "partner.inputPlaceholder")}
          maxLength={500}
          data-testid="partner-input"
          className={`min-h-[48px] w-full min-w-0 flex-1 rounded-input border bg-surface px-3 text-base placeholder:text-text-secondary ${
            mode === "research" ? "border-info" : "border-border-input"
          }`}
        />
        {micSupported ? (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={t(listening ? "partner.micStop" : "partner.micStart")}
            aria-pressed={listening}
            data-testid="partner-mic"
            className={`flex min-h-[48px] w-[48px] shrink-0 items-center justify-center rounded-input border ${
              listening ? "border-action bg-brand-tint" : "border-border-input bg-surface"
            }`}
          >
            {listening ? <Square aria-hidden size={18} /> : <Mic aria-hidden size={20} />}
          </button>
        ) : null}
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

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  testId,
  info,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  testId: string;
  info?: boolean;
}) {
  const activeCls = info ? "border-info bg-info-fill text-text-primary" : "border-action bg-brand-tint text-text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`flex min-h-[40px] items-center gap-2 rounded-pill border px-3 text-sm font-semibold ${
        active ? activeCls : "border-border bg-surface text-text-secondary"
      }`}
    >
      <Icon aria-hidden size={16} />
      {label}
    </button>
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
  // Older answers (before provenance blocks existed) still render correctly as
  // a single records block — history is never rewritten.
  const blocks: PartnerBlock[] = message.blocks?.length
    ? message.blocks
    : [{ source: "records", text: message.text }];
  return (
    <div className="max-w-[92%] space-y-2" data-testid="partner-msg-reply">
      {groupBySource(blocks).map((block, i) => (
        <AnswerBlock key={`${message.id}-${i}`} block={block} t={t} />
      ))}
    </div>
  );
}

/** Consecutive blocks from the SAME lane are one card with one label. The
 *  provenance line is a boundary marker between kinds of knowledge — repeating
 *  it per sentence turns a calm answer into a stack of badges. */
function groupBySource(blocks: PartnerBlock[]): PartnerBlock[] {
  const out: PartnerBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (last && last.source === block.source && !last.sources?.length && !block.sources?.length) {
      out[out.length - 1] = { ...last, text: `${last.text}\n\n${block.text}` };
    } else {
      out.push({ ...block });
    }
  }
  return out;
}

function AnswerBlock({ block, t }: { block: PartnerBlock; t: (id: string) => string }) {
  const edge =
    block.source === "web" ? "border-l-info" : block.source === "guidance" ? "border-l-border" : "border-l-action";
  const label =
    block.source === "web" ? t("partner.fromWebPlain") : block.source === "guidance" ? t("partner.fromGuidance") : t("partner.fromRecords");
  return (
    <div data-testid={`partner-block-${block.source}`}>
      <div className={`money whitespace-pre-line rounded-card border border-l-[3px] border-border ${edge} bg-surface px-3 py-2 text-sm text-text-primary`}>
        {block.text}
        {block.sources?.length ? (
          <div className="mt-3 border-t border-border pt-2" data-testid="partner-sources">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{t("partner.sourcesLabel")}</p>
            <ul className="mt-1 space-y-1">
              {block.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                    {s.title}
                  </a>
                  {s.published ? <span className="text-sm text-text-secondary"> · {s.published}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {label ? (
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {label}
          {block.researched_at ? ` · ${t("partner.researchedOn").replace("{date}", block.researched_at)}` : ""}
        </p>
      ) : null}
    </div>
  );
}
