"use client";
// Appearance setting (Menu → Appearance): light / dark / system, persisted
// per device. "system" (the default) follows the phone's own setting live.
// Applied as html[data-theme="dark"] — the generated token override does the
// rest; no component knows about themes.

export type ThemeSetting = "light" | "dark" | "system";

const KEY = "miy_theme";

export function getThemeSetting(): ThemeSetting {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function resolve(setting: ThemeSetting): "light" | "dark" {
  if (setting !== "system") return setting;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(setting: ThemeSetting = getThemeSetting()): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolve(setting));
}

export function setThemeSetting(setting: ThemeSetting): void {
  window.localStorage.setItem(KEY, setting);
  applyTheme(setting);
}

let wired = false;
export function watchSystemTheme(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemeSetting() === "system") applyTheme("system");
  });
}

// Inline <head> script (runs before paint — no flash of the wrong theme).
export const THEME_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${KEY}");var t=(v==="light"||v==="dark")?v:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
