import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/features/shell/AppShell";
import { business } from "@/mocks/store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!store.get("miy_session")) redirect("/welcome");
  // MOCK: business identity from the demo store; real build resolves it from the session.
  return (
    <AppShell businessName={business.name} initial={business.initial}>
      {children}
    </AppShell>
  );
}
