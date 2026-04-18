import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { CardSummary } from "@/db/cards";
import { getAdminFirestore } from "@/lib/firebase/server";
import { personalWorkspaceId } from "@/lib/firebase/shared";

import { deleteCardIndex, upsertCardIndex } from "./sync";

/**
 * Search-sync failure queue. Path:
 *   workspaces/{wid}/searchSyncFailures/{autoId}
 *
 * Every failed upsert / delete lands here so a sync outage never
 * produces silent index drift. Drainable by `reconcileFailures(uid)`
 * and backed by `reindexAllForUser(uid)` as a nuclear option.
 */

const COLLECTION = "searchSyncFailures";

export type SyncOp = "upsert" | "delete";

export interface SyncFailureRecord {
  cardId: string;
  op: SyncOp;
  error: string;
  enqueuedAt: FirebaseFirestore.Timestamp;
  attempts: number;
}

/**
 * Enqueue a failure. Never throws — we never want the failure-handler
 * itself to fail the caller.
 */
export async function enqueueSyncFailure(
  wid: string,
  cardId: string,
  op: SyncOp,
  error: unknown,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    await db.collection(`workspaces/${wid}/${COLLECTION}`).add({
      cardId,
      op,
      error: errorMessage(error),
      enqueuedAt: FieldValue.serverTimestamp(),
      attempts: 0,
    } satisfies Omit<SyncFailureRecord, "enqueuedAt"> & { enqueuedAt: FieldValue });
  } catch (enqueueErr) {
    console.error("[search-sync] failed to enqueue failure", {
      wid,
      cardId,
      op,
      originalError: errorMessage(error),
      enqueueError: errorMessage(enqueueErr),
    });
  }
}

/**
 * True when Typesense is wired up. Lets the repository skip sync
 * entirely during SITs / offline dev without flooding the queue.
 */
function typesenseConfigured(): boolean {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

/**
 * Run upsert or delete against Typesense, routing failures to the
 * queue. Returns true when the sync succeeded so callers can decide
 * whether to log or retry synchronously. Skipped (returns true) when
 * Typesense is not configured for this environment.
 */
export async function syncWithFallback(
  wid: string,
  op: SyncOp,
  cardId: string,
  card: CardSummary | null,
): Promise<boolean> {
  if (!typesenseConfigured()) return true;
  try {
    if (op === "delete") {
      await deleteCardIndex(cardId);
    } else {
      if (!card) throw new Error(`upsert requested for ${cardId} but card is null`);
      await upsertCardIndex(card);
    }
    return true;
  } catch (err) {
    console.error(`[search-sync] ${op} failed for ${cardId}:`, errorMessage(err));
    await enqueueSyncFailure(wid, cardId, op, err);
    return false;
  }
}

/**
 * Drain the failure queue for one workspace. Bounded batch so a single
 * call can't hog the runtime. Returns counts for visibility.
 */
export interface ReconcileResult {
  processed: number;
  succeeded: number;
  stillFailing: number;
}

export async function reconcileFailures(
  uid: string,
  getCard: (cardId: string) => Promise<CardSummary | null>,
  options: { batchSize?: number } = {},
): Promise<ReconcileResult> {
  const { batchSize = 100 } = options;
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const queueRef = db.collection(`workspaces/${wid}/${COLLECTION}`);
  const snap = await queueRef.orderBy("enqueuedAt", "asc").limit(batchSize).get();

  let succeeded = 0;
  let stillFailing = 0;

  for (const doc of snap.docs) {
    const record = doc.data() as SyncFailureRecord;
    let ok = false;
    try {
      if (record.op === "delete") {
        await deleteCardIndex(record.cardId);
        ok = true;
      } else {
        const card = await getCard(record.cardId);
        if (!card) {
          // Card was hard-deleted between enqueue + drain — treat as resolved.
          ok = true;
        } else {
          await upsertCardIndex(card);
          ok = true;
        }
      }
    } catch (err) {
      ok = false;
      console.error(
        `[search-sync] reconcile retry failed for ${record.cardId}:`,
        errorMessage(err),
      );
    }

    if (ok) {
      await doc.ref.delete();
      succeeded++;
    } else {
      await doc.ref.update({
        attempts: (record.attempts ?? 0) + 1,
        lastError: "retry failed",
      });
      stillFailing++;
    }
  }

  return { processed: snap.size, succeeded, stillFailing };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return "unknown error";
  }
}
