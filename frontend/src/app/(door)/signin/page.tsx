"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/shared/api/client";
import { setActiveBusiness } from "@/shared/api/session";
import { Button } from "@/shared/design-system/Button";
import { useT } from "@/shared/i18n";

interface LoginResponse {
  user: { name: string };
  business: { id: string; name: string } | null;
}

export default function SignInPage() {
  const t = useT();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const data = await api<LoginResponse>("/auth/login", { method: "POST", body: { identifier, password } });
      if (data.business) setActiveBusiness(data.business.id);
      // Full navigation so the business identity is bound fresh for this session.
      window.location.assign("/home");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background px-6">
      <div className="mx-auto w-full max-w-[360px]">
        <h1 className="text-2xl font-bold">{t("door.signIn")}</h1>
        <p className="mt-2 rounded-card bg-info-fill p-3 text-sm text-info">{t("door.demoNote")}</p>
        {error ? (
          <p role="alert" className="mt-3 rounded-card bg-danger-fill p-3 text-sm font-medium text-danger">
            {t("door.signInFailed")}
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label>
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("door.email")}
            </span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
              data-testid="signin-identifier"
            />
          </label>
          <label>
            <span className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              {t("door.password")}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 min-h-[48px] w-full rounded-input border border-border-input bg-surface px-3 text-base"
              data-testid="signin-password"
            />
          </label>
          <Button type="submit" fullWidth loading={busy} data-testid="signin-submit">
            {t("door.signIn")}
          </Button>
        </form>
        <Link href="/signup" className="mt-5 flex min-h-[44px] items-center justify-center text-base font-semibold text-brand">
          {t("door.newHere")}
        </Link>
      </div>
    </main>
  );
}
