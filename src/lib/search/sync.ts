import "server-only";

import type { CardSummary } from "@/db/cards";

import { getTypesenseClient } from "./client";
import { CARDS_COLLECTION_NAME } from "./schema";

/**
 * Firestore → Typesense sync. Happy-path is inline in the server
 * runtime (called immediately after Firestore writes succeed). Failures
 * do not abort the Firestore write — callers queue them to
 * `workspaces/{wid}/searchSyncFailures` for the reconciliation path.
 */

/**
 * Typesense document shape for `cards`. Mirrors schema.ts.
 * Optional fields are omitted when empty so facet cardinality stays clean.
 */
export interface CardSearchDoc {
  id: string;
  cardId: string;
  workspaceId: string;
  memberUids: string[];
  nameZh?: string;
  nameEn?: string;
  companyZh?: string;
  companyEn?: string;
  jobTitleZh?: string;
  jobTitleEn?: string;
  whyRemember?: string;
  notes?: string;
  tagIds?: string[];
  tagNames?: string[];
  lastContactedAt?: number; // unix millis
  createdAt: number; // unix millis
}

/**
 * Pure mapper — CardSummary → Typesense doc. Callers guard against
 * soft-deleted cards (we delete-by-id from the index instead of
 * indexing a ghost row).
 *
 * Stable tagNames ordering (sorted) so unrelated rename operations
 * don't churn the index diff.
 */
export function toSearchDoc(card: CardSummary): CardSearchDoc {
  if (card.deletedAt !== null) {
    throw new Error(`toSearchDoc called on soft-deleted card ${card.id}`);
  }
  const doc: CardSearchDoc = {
    id: card.id,
    cardId: card.id,
    workspaceId: card.workspaceId,
    memberUids: [...card.memberUids].sort(),
    createdAt: card.createdAt?.getTime() ?? 0,
  };
  assignIfNonEmpty(doc, "nameZh", card.nameZh);
  assignIfNonEmpty(doc, "nameEn", card.nameEn);
  assignIfNonEmpty(doc, "companyZh", card.companyZh);
  assignIfNonEmpty(doc, "companyEn", card.companyEn);
  assignIfNonEmpty(doc, "jobTitleZh", card.jobTitleZh);
  assignIfNonEmpty(doc, "jobTitleEn", card.jobTitleEn);
  assignIfNonEmpty(doc, "whyRemember", card.whyRemember);
  assignIfNonEmpty(doc, "notes", card.notes);
  if (card.tagIds.length > 0) doc.tagIds = [...card.tagIds].sort();
  if (card.tagNames.length > 0) doc.tagNames = [...card.tagNames].sort();
  if (card.lastContactedAt) doc.lastContactedAt = card.lastContactedAt.getTime();
  return doc;
}

function assignIfNonEmpty<K extends keyof CardSearchDoc>(
  doc: CardSearchDoc,
  key: K,
  value: string | undefined,
): void {
  if (value && value.trim().length > 0) {
    (doc as unknown as Record<string, unknown>)[key] = value;
  }
}

/**
 * Upsert one card into Typesense. Throws on any non-2xx response so
 * callers can route the failure to the reconciliation queue.
 */
export async function upsertCardIndex(card: CardSummary): Promise<void> {
  const doc = toSearchDoc(card);
  await getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents().upsert(doc);
}

/**
 * Remove a card from Typesense. Safe to call for non-existent docs —
 * 404 is swallowed, every other error bubbles.
 */
export async function deleteCardIndex(cardId: string): Promise<void> {
  try {
    await getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents(cardId).delete();
  } catch (err: unknown) {
    const status = (err as { httpStatus?: number })?.httpStatus;
    if (status === 404) return;
    throw err;
  }
}
