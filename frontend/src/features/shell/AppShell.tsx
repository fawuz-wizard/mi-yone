"use client";
// Application shell (Phase 5 §13): bottom nav + FAB on mobile, sidebar at ≥1024px.
// Same five destinations, same order, both platforms.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ArrowLeftRight, Package, Compass, Menu as MenuIcon, Plus } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { CaptureChooser, CaptureSheet, useCaptureController } from "@/features/capture/CaptureSheet";
import type { CaptureKind } from "@/features/capture/machine";
import { SyncBadge } from "@/shared/design-system/SyncBadge";
import { useMe } from "@/shared/api/me";
import { useT } from "@/shared/i18n";

const CaptureContext = createContext<{ openChooser: () => void; openCapture: (k: CaptureKind) => void }>({
  openChooser: () => {},
  openCapture: () => {},
});

export function useCapture() {
  return useContext(CaptureContext);
}

const NAV = [
  { href: "/home", labelId: "nav.home", Icon: Home },
  { href: "/money", labelId: "nav.money", Icon: ArrowLeftRight },
  { href: "/stock", labelId: "nav.stock", Icon: Package },
  { href: "/partner", labelId: "nav.partner", Icon: Compass },
  { href: "/menu", labelId: "nav.menu", Icon: MenuIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const businessName = me.data?.business?.name ?? "";
  const initial = me.data?.business?.initial ?? "";
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const capture = useCaptureController();

  const navItems = NAV.map(({ href, labelId, Icon }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold lg:min-h-[48px] lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-input lg:px-3 lg:text-sm ${
          active ? "text-brand lg:bg-brand-tint" : "text-text-secondary"
        }`}
      >
        <Icon size={22} strokeWidth={2} aria-hidden />
        {t(labelId)}
      </Link>
    );
  });

  return (
    <CaptureContext.Provider
      value={{
        openChooser: () => setChooserOpen(true),
        openCapture: (k) => capture.open(k),
      }}
    >
      <div className="min-h-dvh lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:gap-1 lg:border-r lg:border-border lg:bg-surface lg:p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-brand-tint font-bold text-brand">
              {initial}
            </span>
            <span className="truncate font-semibold">{businessName}</span>
          </div>
          {navItems}
        </aside>

        <div className="flex min-h-dvh flex-1 flex-col">
          {/* Header: the user's business identity is the header (Phase 4 §3). */}
          <header className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-brand-tint font-bold text-brand">
                {initial}
              </span>
              <h1 className="truncate text-[17px] font-semibold" data-testid="business-name">
                {businessName}
              </h1>
            </div>
            <div className="ml-auto">
              <SyncBadge />
            </div>
          </header>

          <main className="mx-auto w-full max-w-content flex-1 px-4 pb-[144px] lg:px-8 lg:pb-8">{children}</main>

          {/* FAB — the most important control (Phase 4 §5). */}
          <button
            aria-label={t("nav.add")}
            data-testid="fab-add"
            onClick={() => setChooserOpen(true)}
            className="fixed bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] right-4 z-40 flex h-14 w-14 items-center
                       justify-center rounded-pill bg-action text-text-inverse shadow-float active:bg-action-strong
                       lg:bottom-8 lg:right-8"
          >
            <Plus size={28} strokeWidth={2.5} aria-hidden />
          </button>

          {/* Mobile bottom navigation */}
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(64px+env(safe-area-inset-bottom))] border-t
                       border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            {navItems}
          </nav>
        </div>
      </div>

      <CaptureChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onChoose={(kind) => {
          setChooserOpen(false);
          capture.open(kind);
        }}
        onScan={() => {
          setChooserOpen(false);
          router.push("/scan");
        }}
      />
      <CaptureSheet state={capture.state} setState={capture.setState} onClose={capture.close} />
    </CaptureContext.Provider>
  );
}
