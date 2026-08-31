"use client";
// Settings center sheets (Menu): Profile · Business · Appearance · Alerts ·
// Security. Small, focused bottom sheets on the existing design system.
import { useEffect, useState } from "react";
import { BottomSheet } from "@/shared/design-system/BottomSheet";
import { Button } from "@/shared/design-system/Button";
import { FormField } from "@/shared/design-system/FormField";
import { useToast } from "@/shared/design-system/Toast";
import { isDomainError } from "@/shared/api/client";
import { getThemeSetting, setThemeSetting, type ThemeSetting } from "@/shared/theme";
import { useT } from "@/shared/i18n";
import {
  useAlertPrefs,
  useChangePassword,
  useMe,
  useSessions,
  useSignOutOthers,
  useUpdateAlertPrefs,
  useUpdateBusiness,
  useUpdateMe,
  type AlertPrefs,
} from "./api";

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const me = useMe(open);
  const update = useUpdateMe();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && me.data) {
      setName(me.data.user.name);
      setPhone(me.data.user.phone ?? "");
      setEmail(me.data.user.email ?? "");
      setError(null);
    }
  }, [open, me.data]);

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({ name: name.trim(), phone, email });
      toast.show({ message: t("profile.saved") });
      onClose();
    } catch (e) {
      setError(isDomainError(e) && e.kind === "validation" ? t("profile.emailTaken") : t("error.generic"));
    }
  };

  return (
    <BottomSheet open={open} title={t("profile.title")} onClose={onClose}>
      <div className="space-y-3 pb-4">
        <FormField label={t("profile.name")} value={name} onChange={setName} autoComplete="name" />
        <FormField label={t("profile.phone")} value={phone} onChange={setPhone} optional inputMode="tel" autoComplete="tel" />
        <FormField label={t("profile.email")} value={email} onChange={setEmail} optional inputMode="email" autoComplete="email" error={error ?? undefined} />
        <Button fullWidth onClick={() => void save()} disabled={!name.trim()} loading={update.isPending} loadingLabel={t("profile.save")} data-testid="profile-save">
          {t("profile.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}

export function BusinessSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const me = useMe(open);
  const update = useUpdateBusiness();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open && me.data?.business) setName(me.data.business.name);
  }, [open, me.data]);

  const save = async () => {
    try {
      await update.mutateAsync({ name: name.trim() });
      toast.show({ message: t("bizset.saved") });
      onClose();
    } catch {
      toast.show({ message: t("error.generic") });
    }
  };

  return (
    <BottomSheet open={open} title={t("bizset.title")} onClose={onClose}>
      <div className="space-y-3 pb-4">
        <FormField label={t("bizset.name")} value={name} onChange={setName} />
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("bizset.currency")}</p>
          <p className="mt-1 text-base font-semibold">Le · SLE</p>
          <p className="text-sm text-text-secondary">{t("bizset.currencyNote")}</p>
        </div>
        <Button fullWidth onClick={() => void save()} disabled={!name.trim()} loading={update.isPending} loadingLabel={t("bizset.save")} data-testid="business-save">
          {t("bizset.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}

export function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [setting, setSetting] = useState<ThemeSetting>("system");
  useEffect(() => {
    if (open) setSetting(getThemeSetting());
  }, [open]);

  const choose = (v: ThemeSetting) => {
    setSetting(v);
    setThemeSetting(v);
  };

  const options: { value: ThemeSetting; label: string; sub?: string }[] = [
    { value: "system", label: t("appearance.system"), sub: t("appearance.systemSub") },
    { value: "light", label: t("appearance.light") },
    { value: "dark", label: t("appearance.dark") },
  ];

  return (
    <BottomSheet open={open} title={t("appearance.title")} onClose={onClose}>
      <div className="space-y-2 pb-4" role="radiogroup" aria-label={t("appearance.title")}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={setting === o.value}
            onClick={() => choose(o.value)}
            data-testid={`theme-${o.value}`}
            className={`flex min-h-[56px] w-full items-center justify-between rounded-card border px-4 text-left ${
              setting === o.value ? "border-brand bg-brand-tint" : "border-border bg-surface"
            }`}
          >
            <span>
              <span className="block text-base font-semibold">{o.label}</span>
              {o.sub ? <span className="block text-sm text-text-secondary">{o.sub}</span> : null}
            </span>
            {setting === o.value ? <span aria-hidden className="text-brand">✓</span> : null}
          </button>
        ))}
        <p className="text-sm text-text-secondary">{t("appearance.note")}</p>
      </div>
    </BottomSheet>
  );
}

export function AlertsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const prefs = useAlertPrefs(open);
  const update = useUpdateAlertPrefs();
  const [local, setLocal] = useState<AlertPrefs>({ stock: true, debts: true, money: true, records: true });

  useEffect(() => {
    if (open && prefs.data) setLocal(prefs.data);
  }, [open, prefs.data]);

  const toggle = async (key: keyof AlertPrefs) => {
    const next = { ...local, [key]: !local[key] };
    setLocal(next);
    try {
      await update.mutateAsync(next);
      toast.show({ message: t("alerts.saved") });
    } catch {
      setLocal(local); // revert on failure — never lie about what's saved
      toast.show({ message: t("error.generic") });
    }
  };

  const rows: { key: keyof AlertPrefs; label: string; sub: string }[] = [
    { key: "stock", label: t("alerts.stock"), sub: t("alerts.stockSub") },
    { key: "debts", label: t("alerts.debts"), sub: t("alerts.debtsSub") },
    { key: "money", label: t("alerts.money"), sub: t("alerts.moneySub") },
    { key: "records", label: t("alerts.records"), sub: t("alerts.recordsSub") },
  ];

  return (
    <BottomSheet open={open} title={t("alerts.title")} onClose={onClose}>
      <div className="space-y-2 pb-4">
        <p className="text-sm text-text-secondary">{t("alerts.intro")}</p>
        {rows.map((r) => (
          <button
            key={r.key}
            role="switch"
            aria-checked={local[r.key]}
            onClick={() => void toggle(r.key)}
            data-testid={`alert-pref-${r.key}`}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold">{r.label}</span>
              <span className="block text-sm text-text-secondary">{r.sub}</span>
            </span>
            <span
              aria-hidden
              className={`flex h-7 w-12 shrink-0 items-center rounded-pill p-1 transition-colors duration-fast ${
                local[r.key] ? "justify-end bg-brand" : "justify-start bg-skeleton"
              }`}
            >
              <span className="h-5 w-5 rounded-pill bg-surface" />
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function SecuritySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const change = useChangePassword();
  const sessions = useSessions(open);
  const signOutOthers = useSignOutOthers();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      toast.show({ message: t("security.changed") });
      setCurrent("");
      setNext("");
    } catch (e) {
      setError(isDomainError(e) && e.kind === "validation" ? t("security.wrongCurrent") : t("error.generic"));
    }
  };

  const rows = sessions.data?.sessions ?? [];

  return (
    <BottomSheet open={open} title={t("security.title")} onClose={onClose}>
      <div className="space-y-4 pb-4">
        <div className="space-y-3">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("security.changePassword")}</p>
          <FormField label={t("security.current")} value={current} onChange={setCurrent} type="password" autoComplete="current-password" error={error ?? undefined} />
          <FormField label={t("security.new")} value={next} onChange={setNext} type="password" autoComplete="new-password" />
          <Button fullWidth onClick={() => void submit()} disabled={!current || next.length < 10} loading={change.isPending} loadingLabel={t("security.change")} data-testid="password-change">
            {t("security.change")}
          </Button>
        </div>

        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t("security.devices")}</p>
          <ul className="mt-1 divide-y divide-border rounded-card border border-border bg-surface" data-testid="session-list">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{t("security.sessionSince", { date: new Date(s.created_at).toLocaleDateString("en-GB") })}</span>
                {s.current ? (
                  <span className="rounded-pill bg-brand-tint px-2 py-0.5 text-[13px] font-semibold text-brand">
                    {t("security.thisDevice")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {rows.length > 1 ? (
            <div className="mt-2">
              <Button
                level="secondary"
                fullWidth
                onClick={() =>
                  void signOutOthers.mutateAsync().then(() => toast.show({ message: t("security.signedOutOthers") }))
                }
                data-testid="signout-others"
              >
                {t("security.signOutOthers")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
