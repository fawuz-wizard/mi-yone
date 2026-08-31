import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/features/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!store.get("miy_session")) redirect("/welcome");
  // Business identity resolves CLIENT-side from /auth/me (works identically
  // against the mock and the real backend — the shell shows the live name).
  return <AppShell>{children}</AppShell>;
}
