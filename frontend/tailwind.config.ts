import type { Config } from "tailwindcss";

// Tailwind consumes ONLY semantic token variables (Phase 5 §6–7).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        sunken: "var(--color-surface-sunken)",
        skeleton: "var(--color-skeleton)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-disabled": "var(--color-text-disabled)",
        "text-inverse": "var(--color-text-inverse)",
        border: "var(--color-border)",
        "border-input": "var(--color-border-input)",
        brand: "var(--color-brand)",
        "brand-strong": "var(--color-brand-strong)",
        "brand-tint": "var(--color-brand-tint)",
        action: "var(--color-action-primary)",
        "action-strong": "var(--color-action-primary-strong)",
        "money-in": "var(--color-money-in)",
        "money-in-tint": "var(--color-money-in-tint)",
        "money-out": "var(--color-money-out)",
        warning: "var(--color-status-warning)",
        "warning-fill": "var(--color-status-warning-fill)",
        danger: "var(--color-status-danger)",
        "danger-fill": "var(--color-status-danger-fill)",
        info: "var(--color-status-info)",
        "info-fill": "var(--color-status-info-fill)",
        "focus-ring": "var(--color-focus-ring)",
      },
      borderRadius: {
        input: "var(--radius-input)",
        card: "var(--radius-card)",
        sheet: "var(--radius-sheet)",
        dialog: "var(--radius-dialog)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        float: "var(--shadow-float)",
        overlay: "var(--shadow-overlay)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "320ms",
      },
      spacing: {
        // 4px scale is Tailwind-native; page constants:
        gutter: "16px",
        "nav-h": "64px",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"],
      },
      maxWidth: { content: "1040px" },
    },
  },
  plugins: [],
};
export default config;
