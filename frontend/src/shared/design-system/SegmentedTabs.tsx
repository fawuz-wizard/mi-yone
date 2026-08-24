"use client";
// SegmentedTabs (Phase 4 §13): selected = ink text + 2px clay underbar (never color-only).
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => {
              const idx = tabs.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight") onChange(tabs[(idx + 1) % tabs.length].value);
              if (e.key === "ArrowLeft") onChange(tabs[(idx - 1 + tabs.length) % tabs.length].value);
            }}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors duration-fast ${
              selected ? "border-brand text-text-primary" : "border-transparent text-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
