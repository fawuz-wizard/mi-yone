"use client";
// Setup (Phase 5 5I / Phase 3 amendment): the first two minutes must feel like
// SETTING UP MY BUSINESS, not configuring software. One screen: who you are,
// your business's name, and you're in — everything else can wait.
import { useState } from "react";
import Link from "next/link";
import { api, isDomainError } from "@/shared/api/client";
import { setActiveBusiness } from "@/shared/api/session";
import { Button } from "@/shared/design-system/Button";
import { useT } from "@/shared/i18n";

interface RegisterResponse {
  user: { name: string };
  business: { id: string; name: string } | null;
}

export default function SignUpPage() {
  const t = useT();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorId, setErrorId] = useState<string | null>(null);

  const ready = name.trim().length > 0 && businessName.trim().length > 0 && identifier.trim().length >= 3 && password.length >= 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setErrorId(null);
    try {
      const data = await api<RegisterResponse>("/auth/register", {
        method: "POST",
        body: {
          name: name.trim(),
          identifier: identifier.trim(),
          password,
          business_name: businessName.trim(),
        },
      });
      if (data.business) setActiveBusiness(data.business.id);
      // Full navigation so the session-bound business identity is picked up fresh.
      window.location.assign("/home");
    } catch (err) {
      setErrorId(isDomainError(err) && err.kind === "network" ? "error.network" : "door.signupFailed");
      setBusy(false);
    }
  }

  const field =
    "mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base";
  const label = "text-[13px] font-semibold uppercase tracking-wide text-text-secondary";

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-[360px]">
        <p className="text-xl font-bold tracking-wide text-brand">MI YONE</p>
        <h1 className="mt-4 text-2xl font-bold">{t("door.signupTitle")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("door.signupIntro")}</p>

        {errorId ? (
          <p role="alert" className="mt-3 rounded-card bg-danger-fill p-3 text-sm font-medium text-danger">
            {t(errorId)}
          </p>
        ) : null}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label>
            <span className={label}>{t("door.yourName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              className={field}
              data-testid="signup-name"
            />
          </label>
          <label>
            <span className={label}>{t("door.businessName")}</span>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
              maxLength={120}
              className={field}
              data-testid="signup-business"
            />
          </label>
          <label>
            <span className={label}>{t("door.email")}</span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              maxLength={255}
              className={field}
              data-testid="signup-identifier"
            />
          </label>
          <label>
            <span className={label}>{t("door.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={200}
              className={field}
              data-testid="signup-password"
            />
            <span className="mt-1 block text-xs text-text-secondary">{t("door.passwordHint")}</span>
          </label>
          <Button type="submit" fullWidth disabled={!ready} loading={busy} loadingLabel={t("door.createButton")} data-testid="signup-submit">
            {t("door.createButton")}
          </Button>
        </form>

        <Link href="/signin" className="mt-5 flex min-h-[44px] items-center justify-center text-base font-semibold text-brand">
          {t("door.haveAccount")}
        </Link>
      </div>
    </main>
  );
}
