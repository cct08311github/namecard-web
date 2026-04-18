import { redirect } from "next/navigation";

import { listCardsForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";

import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "匯入" };

export default async function ImportPage() {
  const user = await readSession();
  if (!user) redirect("/login");
  const existing = await listCardsForUser(user.uid, { limit: 500 });
  return <ImportWizard existingCards={existing} />;
}
