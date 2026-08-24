"use client";
// Button system (Phase 4 §14). One Primary per screen region; hierarchy by level, not size.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Level = "primary" | "secondary" | "tertiary" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  level?: Level;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-input font-semibold text-base " +
  "min-h-[48px] px-5 select-none transition-colors duration-fast " +
  "disabled:opacity-40 disabled:pointer-events-none";

const levels: Record<Level, string> = {
  primary: "bg-action text-text-inverse active:bg-action-strong",
  secondary: "border-[1.5px] border-brand text-brand bg-transparent active:bg-brand-tint",
  tertiary: "text-brand bg-transparent min-h-[44px] px-3 active:bg-brand-tint",
  destructive: "bg-danger text-text-inverse active:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { level = "primary", loading = false, loadingLabel, fullWidth = false, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${base} ${levels[level]} ${fullWidth ? "w-full" : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-pill border-2 border-current border-t-transparent"
          />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
