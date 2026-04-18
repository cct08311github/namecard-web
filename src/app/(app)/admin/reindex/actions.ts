"use server";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { getCardForUser, listCardsForUser } from "@/db/cards";
import { authedAction } from "@/lib/auth/safe-action";
import { getAdminFirestore } from "@/lib/firebase/server";
import { personalWorkspaceId } from "@/lib/firebase/shared";
import { reconcileFailures } from "@/lib/search/reconcile";
import { upsertCardIndex } from "@/lib/search/sync";

/**
 * Admin: nuclear re-index of the whole workspace. Expensive — rate-limited
 * to once per 60 seconds per user via a Firestore doc lock.
 */

const LOCK_COLLECTION = "reindexLocks";
const LOCK_TTL_MS = 60_000;

export const reindexAllAction = authedAction.action(async ({ ctx }) => {
  const uid = ctx.user.uid;
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const lockRef = db.doc(`workspaces/${wid}/${LOCK_COLLECTION}/singleton`);

  const now = Date.now();
  const acquired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const last =
      (snap.data()?.lastRunAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
    if (now - last < LOCK_TTL_MS) return false;
    tx.set(lockRef, { lastRunAt: FieldValue.serverTimestamp(), lastRunBy: uid });
    return true;
  });
  if (!acquired) {
    throw new Error("最近才 reindex 過，請稍候再試（每分鐘一次）");
  }

  const cards = await listCardsForUser(uid, { limit: 1000 });
  let reindexed = 0;
  let failed = 0;
  for (const card of cards) {
    try {
      await upsertCardIndex(card);
      reindexed++;
    } catch (err) {
      failed++;
      console.error(`[reindex] ${card.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { reindexed, failed, total: cards.length };
});

export const reconcileFailuresAction = authedAction
  .inputSchema(z.object({ batchSize: z.number().int().min(1).max(500).default(100) }))
  .action(async ({ parsedInput, ctx }) => {
    const uid = ctx.user.uid;
    const result = await reconcileFailures(uid, (cardId) => getCardForUser(uid, cardId), {
      batchSize: parsedInput.batchSize,
    });
    return result;
  });
