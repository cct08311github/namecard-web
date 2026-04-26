import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { listCardsForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";
import { countFollowupsInCards } from "@/lib/timeline/followups";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");
  // First-login idempotent bootstrap.
  await ensurePersonalWorkspace({ uid: user.uid, displayName: user.displayName });

  // Compute the follow-up urgency count once, here, so every page in the
  // (app) group can show a global badge in the rail without repeating
  // the query per-page. Costs +1 Firestore read on pages that don't
  // already query cards — acceptable at personal-workspace scale.
  let followupsTotal = 0;
  try {
    const cards = await listCardsForUser(user.uid, {
      limit: 200,
      orderBy: "createdAt",
      order: "desc",
    });
    followupsTotal = countFollowupsInCards(cards, new Date());
  } catch (err) {
    // Don't take down the entire app shell if the count query fails.
    console.error("[layout] followups count failed:", err instanceof Error ? err.message : err);
  }

  return (
    <AppShell user={user} followupsTotal={followupsTotal}>
      {children}
    </AppShell>
  );
}
