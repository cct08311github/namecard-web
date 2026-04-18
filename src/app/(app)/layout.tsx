import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { readSession } from "@/lib/firebase/session";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");
  // First-login idempotent bootstrap.
  await ensurePersonalWorkspace({ uid: user.uid, displayName: user.displayName });

  return <AppShell user={user}>{children}</AppShell>;
}
