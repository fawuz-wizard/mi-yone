"use client";
// ChipPicker (Phase 4 §13): chips over dropdowns — recent/frequent first, search
// behind "More…". Selected = brand-tint fill + check glyph (never color alone).
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { SearchField } from "./SearchField";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { useT } from "@/shared/i18n";

export interface ChipOption {
  id: string;
  label: string;
  sublabel?: string;
}

export function ChipPicker({
  label,
  options,
  selectedId,
  onSelect,
  visibleCount = 6,
  onCreate,
  createLabel,
  createFieldLabel,
}: {
  label: string;
  options: ChipOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  visibleCount?: number;
  onCreate?: (name: string) => Promise<ChipOption>;
  createLabel?: string;
  createFieldLabel?: string;
}) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Keep the selected option visible even when it lives behind "More…".
  const visible = useMemo(() => {
    const head = options.slice(0, visibleCount);
    const selected = options.find((o) => o.id === selectedId);
    if (selected && !head.some((o) => o.id === selected.id)) return [selected, ...head.slice(0, visibleCount - 1)];
    return head;
  }, [options, selectedId, visibleCount]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  const chipBase =
    "inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border px-3 text-[13px] font-semibold transition-colors duration-fast";

  async function create() {
    if (!onCreate || !newName.trim()) return;
    setBusy(true);
    try {
      const option = await onCreate(newName.trim());
      onSelect(option.id);
      setCreating(false);
      setNewName("");
      setMoreOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-2">
        {visible.map((o) => {
          const selected = o.id === selectedId;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(selected ? null : o.id)}
              className={`${chipBase} ${
                selected ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface text-text-primary"
              }`}
            >
              {selected ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
              {o.label}
            </button>
          );
        })}
        {options.length > visibleCount || onCreate ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`${chipBase} border-border bg-surface text-text-secondary`}
          >
            {t("chip.more")}
          </button>
        ) : null}
      </div>

      <BottomSheet open={moreOpen} title={label} onClose={() => setMoreOpen(false)}>
        <div className="space-y-3 pb-4">
          <SearchField value={query} onChange={setQuery} />
          <div className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o.id);
                  setMoreOpen(false);
                }}
                className="flex min-h-[48px] w-full items-center justify-between bg-surface px-4 text-left active:bg-sunken"
              >
                <span className="text-base font-medium">{o.label}</span>
                {o.sublabel ? <span className="text-sm text-text-secondary">{o.sublabel}</span> : null}
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="bg-surface px-4 py-4 text-sm text-text-secondary">{t("money.searchNoResults")}</p>
            ) : null}
          </div>
          {onCreate ? (
            creating ? (
              <div className="space-y-2">
                <FormField label={createFieldLabel ?? createLabel ?? ""} value={newName} onChange={setNewName} />
                <Button fullWidth loading={busy} onClick={() => void create()} data-testid="chip-create-confirm">
                  {createLabel}
                </Button>
              </div>
            ) : (
              <Button level="secondary" fullWidth onClick={() => setCreating(true)} data-testid="chip-create">
                <Plus size={16} aria-hidden /> {createLabel}
              </Button>
            )
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
