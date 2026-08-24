"use client";
// SearchField (Phase 4 §13): one per list screen; 44dp; leading icon, trailing clear.
import { Search, X } from "lucide-react";
import { useT } from "@/shared/i18n";

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  return (
    <div className="relative">
      <Search
        aria-hidden
        size={18}
        strokeWidth={2}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
      />
      <input
        type="search"
        role="searchbox"
        aria-label={placeholder ?? t("search.label")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("search.label")}
        className="min-h-[44px] w-full rounded-input border border-border-input bg-surface pl-10 pr-10 text-base
                   [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("search.clear")}
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-text-secondary"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
