"use client";
// FormField (Phase 4 §13): label above, 48dp input, error line below.
// Never placeholder-as-label; "(optional)" marks the exception, not the rule.
import { useId } from "react";

export function FormField({
  label,
  value,
  onChange,
  type = "text",
  optional = false,
  error,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  optional?: boolean;
  error?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1 min-h-[48px] w-full rounded-input border bg-surface px-3 text-base ${
          error ? "border-danger" : "border-border-input"
        }`}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
