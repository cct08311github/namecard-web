"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicAction } from "@/lib/auth/safe-action";
import { createSession, destroySession } from "@/lib/firebase/session";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";

export const signInWithIdTokenAction = publicAction
  .inputSchema(
    z.object({
      idToken: z.string().min(20, "無效的 ID token"),
      next: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const user = await createSession(parsedInput.idToken);
    await ensurePersonalWorkspace({ uid: user.uid, displayName: user.displayName });
    return { ok: true as const, next: parsedInput.next ?? "/" };
  });

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
