"use client";
// The door — MI YONE's one brand moment (Phase 5 §15/§53).
import Link from "next/link";
import { useT } from "@/shared/i18n";

export default function WelcomePage() {
  const t = useT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <div>
        {/* Logo pending owner approval (Phase 4 §4) — wordmark placeholder within spec. */}
        <p className="text-3xl font-bold tracking-wide text-brand">MI YONE</p>
        <p className="mt-3 text-lg text-text-secondary">{t("door.tagline")}</p>
      </div>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <Link
          href="/signup"
          className="flex min-h-[48px] items-center justify-center rounded-input bg-action text-base font-semibold text-text-inverse"
        >
          {t("door.getStarted")}
        </Link>
        <Link
          href="/signin"
          className="flex min-h-[44px] items-center justify-center rounded-input text-base font-semibold text-brand"
        >
          {t("door.haveAccount")}
        </Link>
      </div>
    </main>
  );
}
