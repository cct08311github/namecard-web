import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import {
  cardsPath,
  personalWorkspaceId,
  SUB_COLLECTION_CARDS,
  COLLECTION_WORKSPACES,
} from "@/lib/firebase/shared";
import { syncWithFallback } from "@/lib/search/reconcile";

import { chunkArray, runParallelLimited } from "./_utils";
import type { CardCreateInput, CardUpdateInput } from "./schema";

/**
 * Card repository backed by Firestore Admin SDK.
 * All reads filter by memberUids so Security Rules + server validation agree.
 */

export type PhoneLabel = "mobile" | "office" | "home" | "fax" | "other";
export type EmailLabel = "work" | "personal" | "other";

export interface CardSummary {
  id: string;
  workspaceId: string;
  ownerUid: string;
  memberUids: string[];
  nameZh?: string;
  nameEn?: string;
  namePhonetic?: string;
  companyZh?: string;
  companyEn?: string;
  jobTitleZh?: string;
  jobTitleEn?: string;
  department?: string;
  whyRemember: string;
  firstMetDate?: string;
  firstMetContext?: string;
  firstMetEventTag?: string;
  notes?: string;
  tagIds: string[];
  tagNames: string[];
  phones: Array<{ label: PhoneLabel; value: string; primary?: boolean }>;
  emails: Array<{ label: EmailLabel; value: string; primary?: boolean }>;
  social?: Record<string, string | undefined>;
  frontImagePath?: string;
  backImagePath?: string;
  /**
   * Optional for backwards compat with card docs predating the pin
   * feature. Consumers should treat undefined as false (categorize,
   * CardActions already do).
   */
  isPinned?: boolean;
  /**
   * Future-action reminder timestamp. Set via setFollowUpForUser; auto-
   * cleared on logContactEvent. null/undefined both mean no reminder
   * pending — projection always normalizes to `Date | null`, but the
   * type stays optional so old fixtures that never touched it stay
   * valid (mirrors the isPinned backwards-compat pattern).
   */
  followUpAt?: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastContactedAt: Date | null;
  deletedAt: Date | null;
}

import { toSummaryFromData } from "./cards-data";

const toSummary = toSummaryFromData;

interface ListOptions {
  limit?: number;
  orderBy?: "createdAt" | "lastContactedAt" | "updatedAt";
  order?: "asc" | "desc";
  includeDeleted?: boolean;
}

export async function listCardsForUser(
  uid: string,
  options: ListOptions = {},
): Promise<CardSummary[]> {
  const { limit = 200, orderBy = "createdAt", order = "desc", includeDeleted = false } = options;
  const db = getAdminFirestore();
  let query: FirebaseFirestore.Query = db
    .collectionGroup(SUB_COLLECTION_CARDS)
    .where("memberUids", "array-contains", uid);
  if (!includeDeleted) {
    // Firestore treats missing fields as != null for specific filters, so
    // only soft-delete check is via explicit exclusion at app level.
  }
  query = query.orderBy(orderBy, order).limit(limit);
  const snap = await query.get();
  return snap.docs
    .map((doc) => toSummary(doc.id, doc.data()))
    .filter((card) => includeDeleted || card.deletedAt === null);
}

export async function getCardForUser(uid: string, cardId: string): Promise<CardSummary | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const doc = await db.doc(`${cardsPath(wid)}/${cardId}`).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (!data.memberUids?.includes(uid)) return null;
  return toSummary(doc.id, data);
}

export interface CreateCardOptions {
  uid: string;
  displayName?: string;
}

export async function createCardForUser(
  input: CardCreateInput,
  { uid }: CreateCardOptions,
): Promise<{ id: string }> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = db.collection(cardsPath(wid)).doc();
  await ref.set({
    ...input,
    workspaceId: wid,
    ownerUid: uid,
    memberUids: [uid],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  // Re-read so serverTimestamp is resolved before we ship to Typesense;
  // sync failures degrade to the reconcile queue, they don't abort the
  // Firestore write.
  const snap = await ref.get();
  if (snap.exists) {
    await syncWithFallback(wid, "upsert", ref.id, toSummary(ref.id, snap.data()!));
  }
  return { id: ref.id };
}

export async function updateCardForUser(
  cardId: string,
  input: CardUpdateInput,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("名片不存在");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限修改此名片");
  await ref.update({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
    // Immutable fields — ignore if client tries to send them
    ownerUid: data.ownerUid,
    workspaceId: data.workspaceId,
    memberUids: data.memberUids,
  });
  const after = await ref.get();
  if (after.exists) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }
}

export async function softDeleteCardForUser(
  cardId: string,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("名片不存在");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限刪除此名片");
  await ref.update({
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Soft-delete → remove from index; the reconciler handles any failure.
  await syncWithFallback(wid, "delete", cardId, null);
}

export async function touchLastContactedAt(
  cardId: string,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  await ref.update({
    lastContactedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Ranking signal changed — reindex so sort_by: lastContactedAt:desc
  // reflects the new contact event immediately.
  const after = await ref.get();
  if (after.exists && after.data()?.deletedAt === null) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }
}

/**
 * Patch shape for bulk operations. Optional fields:
 *   - addTagIds / addTagNames: union into existing arrays (deduped)
 *   - setEventTag: replace firstMetEventTag (empty string clears)
 *   - setPinned: replace isPinned
 *
 * Combines the most-asked-for "scrub a stack of cards" actions while
 * staying conservative — no overwrite of name / phone / email at the
 * bulk layer (those need per-card review).
 */
export interface BulkPatch {
  addTagIds?: string[];
  addTagNames?: string[];
  setEventTag?: string;
  setPinned?: boolean;
}

const BULK_CHUNK = 400;

function mergeUnique<T>(a: readonly T[], b: readonly T[]): T[] {
  const set = new Set<T>(a);
  for (const item of b) set.add(item);
  return Array.from(set);
}

/**
 * Apply `patch` to every card in `ids` that the caller is a member of.
 * Skips ids the user can't access. Each chunk is one Firestore batch.
 * Typesense reindex follows so search ranking stays in sync.
 *
 * Returns the count of cards actually mutated.
 */
export async function bulkUpdateCardsForUser(
  uid: string,
  ids: readonly string[],
  patch: BulkPatch,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const chunks = chunkArray(ids, BULK_CHUNK);
  let updated = 0;
  const updatedSummaries: CardSummary[] = [];

  await runParallelLimited(chunks, 3, async (chunk) => {
    const refs = chunk.map((id) => db.doc(`${cardsPath(wid)}/${id}`));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let touched = 0;
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      if (!data.memberUids?.includes(uid)) continue;
      if (data.deletedAt) continue;
      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (patch.addTagIds && patch.addTagIds.length > 0) {
        update.tagIds = mergeUnique(data.tagIds ?? [], patch.addTagIds);
      }
      if (patch.addTagNames && patch.addTagNames.length > 0) {
        update.tagNames = mergeUnique(data.tagNames ?? [], patch.addTagNames);
      }
      if (patch.setEventTag !== undefined) {
        update.firstMetEventTag = patch.setEventTag;
      }
      if (patch.setPinned !== undefined) {
        update.isPinned = patch.setPinned;
      }
      batch.update(snap.ref, update);
      touched++;
    }
    if (touched > 0) {
      await batch.commit();
      updated += touched;
      const refresh = await db.getAll(...refs);
      for (const snap of refresh) {
        if (!snap.exists) continue;
        const data = snap.data()!;
        if (!data.memberUids?.includes(uid) || data.deletedAt) continue;
        updatedSummaries.push(toSummary(snap.id, data));
      }
    }
  });

  for (const card of updatedSummaries) {
    await syncWithFallback(wid, "upsert", card.id, card);
  }
  return { updated };
}

/**
 * Soft-delete every card in `ids` the caller can access. Mirrors
 * single-card softDeleteCardForUser semantics (deletedAt + Typesense
 * delete). Returns count actually deleted.
 */
export async function bulkSoftDeleteCardsForUser(
  uid: string,
  ids: readonly string[],
): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const chunks = chunkArray(ids, BULK_CHUNK);
  let deleted = 0;
  const deletedIds: string[] = [];

  await runParallelLimited(chunks, 3, async (chunk) => {
    const refs = chunk.map((id) => db.doc(`${cardsPath(wid)}/${id}`));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let touched = 0;
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      if (!data.memberUids?.includes(uid)) continue;
      if (data.deletedAt) continue;
      batch.update(snap.ref, {
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      deletedIds.push(snap.id);
      touched++;
    }
    if (touched > 0) {
      await batch.commit();
      deleted += touched;
    }
  });

  for (const id of deletedIds) {
    await syncWithFallback(wid, "delete", id, null);
  }
  return { deleted };
}

/**
 * Merge `mergeIds` cards into `keepId`:
 *   - Union phones / emails (dedup by value), tagIds + tagNames
 *   - Fill empty social fields from merged-in records
 *   - Concatenate notes with provenance prefix per merged card
 *   - lastContactedAt → max across all
 *   - Soft-delete merged + Typesense delete
 *
 * Refuses if any id isn't accessible to the caller, the keep card
 * is missing/deleted, or keepId appears in mergeIds.
 */
export async function mergeCardsForUser(
  uid: string,
  keepId: string,
  mergeIds: readonly string[],
): Promise<{ merged: number }> {
  if (mergeIds.length === 0) return { merged: 0 };
  if (mergeIds.includes(keepId)) {
    throw new Error("keepId cannot also appear in mergeIds");
  }
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const allIds = [keepId, ...mergeIds];
  const refs = allIds.map((id) => db.doc(`${cardsPath(wid)}/${id}`));
  const snaps = await db.getAll(...refs);
  const docs = snaps.map((s, i) => ({ id: allIds[i], snap: s }));

  const keep = docs.find((d) => d.id === keepId)!.snap;
  if (!keep.exists) throw new Error("keep card not found");
  const keepData = keep.data()!;
  if (!keepData.memberUids?.includes(uid)) throw new Error("無權限合併此名片");
  if (keepData.deletedAt) throw new Error("不能合併已刪除的名片");

  const mergeData: FirebaseFirestore.DocumentData[] = [];
  for (const m of docs) {
    if (m.id === keepId) continue;
    if (!m.snap.exists) throw new Error(`merge card ${m.id} not found`);
    const data = m.snap.data()!;
    if (!data.memberUids?.includes(uid)) throw new Error("無權限合併此名片");
    if (data.deletedAt) continue;
    mergeData.push(data);
  }

  // Phones — dedup by trimmed value (preserve original case).
  const phoneByValue = new Map<string, { label: string; value: string; primary?: boolean }>();
  for (const arr of [keepData.phones ?? [], ...mergeData.map((d) => d.phones ?? [])]) {
    for (const p of arr) {
      const key = (p.value ?? "").trim();
      if (key && !phoneByValue.has(key)) phoneByValue.set(key, p);
    }
  }
  const emailByValue = new Map<string, { label: string; value: string; primary?: boolean }>();
  for (const arr of [keepData.emails ?? [], ...mergeData.map((d) => d.emails ?? [])]) {
    for (const e of arr) {
      const key = (e.value ?? "").trim().toLowerCase();
      if (key && !emailByValue.has(key)) emailByValue.set(key, e);
    }
  }
  const tagIds = mergeUnique<string>(
    keepData.tagIds ?? [],
    mergeData.flatMap((d) => d.tagIds ?? []),
  );
  const tagNames = mergeUnique<string>(
    keepData.tagNames ?? [],
    mergeData.flatMap((d) => d.tagNames ?? []),
  );
  const social: Record<string, string | undefined> = { ...(keepData.social ?? {}) };
  for (const md of mergeData) {
    const s = (md.social ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(s)) {
      if (v && !social[k]) social[k] = String(v);
    }
  }

  const notesParts: string[] = [];
  if (keepData.notes) notesParts.push(String(keepData.notes));
  for (const md of mergeData) {
    const tag = md.whyRemember ? `【併入：${md.whyRemember}】` : "【併入】";
    if (md.notes) notesParts.push(`${tag}\n${md.notes}`);
    else notesParts.push(tag);
  }
  const notes = notesParts.join("\n\n").slice(0, 4000);

  const lastContactedAtMs = Math.max(
    keepData.lastContactedAt?.toMillis?.() ?? 0,
    ...mergeData.map((d) => d.lastContactedAt?.toMillis?.() ?? 0),
  );

  const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    phones: Array.from(phoneByValue.values()).slice(0, 10),
    emails: Array.from(emailByValue.values()).slice(0, 10),
    tagIds: tagIds.slice(0, 30),
    tagNames: tagNames.slice(0, 30),
    social,
    notes,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (lastContactedAtMs > 0) {
    update.lastContactedAt = new Date(lastContactedAtMs);
  }

  const batch = db.batch();
  batch.update(keep.ref, update);
  for (const m of docs) {
    if (m.id === keepId) continue;
    if (!m.snap.exists || m.snap.data()?.deletedAt) continue;
    batch.update(m.snap.ref, {
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  const after = await keep.ref.get();
  if (after.exists && after.data()?.deletedAt === null) {
    await syncWithFallback(wid, "upsert", keepId, toSummary(keepId, after.data()!));
  }
  for (const m of docs) {
    if (m.id === keepId) continue;
    await syncWithFallback(wid, "delete", m.id, null);
  }
  return { merged: mergeData.length };
}

/**
 * Find other cards from the same event tag (e.g. "2024 COMPUTEX") so
 * the detail page can show 「同場合認識的人」. Filtered by memberUids
 * to honor the same access boundary as `listCardsForUser` and exclude
 * the card we're viewing. Returns at most `limit` results, sorted by
 * createdAt desc so newer additions surface first.
 */
export async function getCardsBySharedEvent(
  uid: string,
  eventTag: string,
  excludeCardId: string,
  limit = 8,
): Promise<CardSummary[]> {
  if (!eventTag.trim()) return [];
  const db = getAdminFirestore();
  const snap = await db
    .collectionGroup(SUB_COLLECTION_CARDS)
    .where("memberUids", "array-contains", uid)
    .where("firstMetEventTag", "==", eventTag)
    .limit(limit + 1) // +1 so we can drop the current card and still hit the cap
    .get();
  return snap.docs
    .map((doc) => toSummary(doc.id, doc.data()))
    .filter((card) => card.id !== excludeCardId && card.deletedAt === null)
    .slice(0, limit);
}

/**
 * Toggle the pin flag on a card. Pinned cards surface in the Timeline
 * "Pinned" section at the top and are excluded from "uncontacted"
 * so core contacts aren't shame-nudged. Pin state does not affect
 * Typesense ranking (pinned is a UI concern, not a search signal),
 * so this write intentionally skips the reindex.
 */
export async function setCardPinned(cardId: string, uid: string, pinned: boolean): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("card not found");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限修改此名片");
  await ref.update({
    isPinned: pinned,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Set or clear a future follow-up reminder. `followUpAt` accepts a
 * `YYYY-MM-DD` string (interpreted as midnight local time, then stored
 * as a Date) or `null` to clear an existing reminder. logContactEvent
 * auto-clears this — the assumption is that a logged interaction is
 * the action you were reminding yourself to do.
 *
 * Reindexes Typesense afterwards so any list view sorting / filtering
 * by followUpAt picks up the change immediately.
 */
export async function setFollowUpForUser(
  cardId: string,
  uid: string,
  followUpAt: string | null,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("card not found");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限修改此名片");

  let value: Date | null = null;
  if (followUpAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(followUpAt)) {
      throw new Error("Invalid followUpAt format (expected YYYY-MM-DD)");
    }
    // Midnight local time so date inputs in any timezone round-trip
    // to the same calendar day the user picked.
    value = new Date(`${followUpAt}T00:00:00`);
    if (Number.isNaN(value.getTime())) throw new Error("Invalid followUpAt date");
  }

  await ref.update({
    followUpAt: value,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const after = await ref.get();
  if (after.exists && after.data()?.deletedAt === null) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }
}

// ==================== Contact events (append-only log) ====================

export const SUB_COLLECTION_CONTACT_EVENTS = "contactEvents";

export interface ContactEvent {
  id: string;
  at: Date;
  note: string;
  authorUid: string;
  authorDisplay: string | null;
}

export interface LogContactEventOptions {
  uid: string;
  note?: string;
  authorDisplay?: string | null;
}

/**
 * Append a contact event to a card's log AND update the card's
 * lastContactedAt ranking signal in a single batch. Typesense reindex
 * follows so sort_by: lastContactedAt:desc reflects the change.
 *
 * Returns the event id for callers that want to show it optimistically.
 * Throws if the caller is not a member of the card.
 */
export async function logContactEvent(
  cardId: string,
  { uid, note = "", authorDisplay = null }: LogContactEventOptions,
): Promise<string> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const cardRef = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await cardRef.get();
  if (!snap.exists) throw new Error("card not found");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限記錄互動");

  const trimmedNote = note.slice(0, 500);
  const eventRef = cardRef.collection(SUB_COLLECTION_CONTACT_EVENTS).doc();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(eventRef, {
    at: now,
    note: trimmedNote,
    authorUid: uid,
    authorDisplay,
  });
  // Auto-clear any pending follow-up reminder — the action you were
  // reminding yourself to do has now happened. Idempotent: if there
  // wasn't one set, the field stays at null.
  batch.update(cardRef, {
    lastContactedAt: now,
    updatedAt: now,
    followUpAt: null,
  });
  await batch.commit();

  const after = await cardRef.get();
  if (after.exists && after.data()?.deletedAt === null) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }

  return eventRef.id;
}

/**
 * Read recent contact events for a card, newest first. Access check
 * uses the same memberUids rule as getCardForUser — we don't leak
 * events from cards the caller can't otherwise read.
 */
export async function listContactEventsForUser(
  cardId: string,
  uid: string,
  limit = 50,
): Promise<ContactEvent[]> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const cardRef = db.doc(`${cardsPath(wid)}/${cardId}`);
  const cardSnap = await cardRef.get();
  if (!cardSnap.exists) return [];
  const data = cardSnap.data()!;
  if (!data.memberUids?.includes(uid)) return [];

  const snap = await cardRef
    .collection(SUB_COLLECTION_CONTACT_EVENTS)
    .orderBy("at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const raw = doc.data();
    return {
      id: doc.id,
      at: raw.at?.toDate?.() ?? new Date(0),
      note: typeof raw.note === "string" ? raw.note : "",
      authorUid: typeof raw.authorUid === "string" ? raw.authorUid : "",
      authorDisplay:
        typeof raw.authorDisplay === "string"
          ? raw.authorDisplay
          : raw.authorDisplay === null
            ? null
            : null,
    } satisfies ContactEvent;
  });
}

export { COLLECTION_WORKSPACES, SUB_COLLECTION_CARDS };
