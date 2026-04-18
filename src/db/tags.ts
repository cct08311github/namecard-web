import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { cardsPath, personalWorkspaceId, tagsPath } from "@/lib/firebase/shared";
import { syncWithFallback } from "@/lib/search/reconcile";
import { DEFAULT_TAG_COLOR, isPaletteColor } from "@/lib/tags/palette";

import { toSummaryFromData } from "./cards-data";
import { chunkArray, runParallelLimited } from "./_utils";

export interface TagSummary {
  id: string;
  name: string;
  color: string;
  createdAt: Date | null;
}

const BATCH_CHUNK = 400; // 500 is the Firestore cap; 400 keeps headroom for the update payload

function normalizeColor(color: string | undefined): string {
  return isPaletteColor(color) ? color : DEFAULT_TAG_COLOR;
}

function toTagSummary(id: string, data: FirebaseFirestore.DocumentData): TagSummary {
  return {
    id,
    name: data.name,
    color: data.color ?? DEFAULT_TAG_COLOR,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  };
}

export async function listTagsForUser(uid: string): Promise<TagSummary[]> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const snap = await db.collection(tagsPath(wid)).orderBy("name").get();
  return snap.docs.map((d) => toTagSummary(d.id, d.data()));
}

export async function createTagForUser(
  uid: string,
  input: { name: string; color?: string },
): Promise<{ id: string }> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const existing = await db
    .collection(tagsPath(wid))
    .where("name", "==", input.name)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { id: existing.docs[0]!.id };
  }
  const ref = db.collection(tagsPath(wid)).doc();
  await ref.set({
    workspaceId: wid,
    name: input.name,
    color: normalizeColor(input.color),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

export async function recolorTagForUser(uid: string, tagId: string, color: string): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${tagsPath(wid)}/${tagId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("標籤不存在");
  await ref.update({ color: normalizeColor(color) });
  // Color is UI-only — not in search index, no reindex needed.
}

/**
 * Rename a tag, propagate the new name to every card that references
 * it, and reindex those cards in Typesense. Wraps the tag doc rename
 * in a transaction so concurrent renames don't both commit; card
 * updates happen in 400-doc chunks with parallel-limited reindex.
 */
export async function renameTagForUser(
  uid: string,
  tagId: string,
  newName: string,
): Promise<{ cardsUpdated: number }> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const tagRef = db.doc(`${tagsPath(wid)}/${tagId}`);

  const oldName = await db.runTransaction(async (tx) => {
    const snap = await tx.get(tagRef);
    if (!snap.exists) throw new Error("標籤不存在");
    const current = snap.data()?.name as string;
    if (current === newName) return current;
    tx.update(tagRef, { name: newName });
    return current;
  });
  if (oldName === newName) return { cardsUpdated: 0 };

  // Find affected cards, chunk them, update each chunk + reindex.
  const cardsSnap = await db
    .collection(cardsPath(wid))
    .where("tagIds", "array-contains", tagId)
    .get();

  let cardsUpdated = 0;
  const chunks = chunkArray(cardsSnap.docs, BATCH_CHUNK);
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      const data = doc.data();
      const nextTagNames = (data.tagNames ?? []).map((n: string) => {
        // We don't know the old name position in tagNames; rely on name
        // match since TagInput always writes parallel arrays.
        return n === oldName ? newName : n;
      });
      batch.update(doc.ref, { tagNames: nextTagNames, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();

    // Re-read + reindex chunk (parallel-limited to 4).
    await runParallelLimited(chunk, 4, async (doc) => {
      const after = await doc.ref.get();
      if (!after.exists) return;
      const data = after.data()!;
      if (data.deletedAt) return;
      await syncWithFallback(wid, "upsert", doc.id, toSummaryFromData(doc.id, data));
    });
    cardsUpdated += chunk.length;
  }

  return { cardsUpdated };
}

/**
 * Hard-delete a tag and scrub it from every referencing card. Batched
 * the same way rename does, with reindex on each chunk.
 */
export async function deleteTagForUser(
  uid: string,
  tagId: string,
): Promise<{ cardsScrubbed: number }> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const tagRef = db.doc(`${tagsPath(wid)}/${tagId}`);
  const tagSnap = await tagRef.get();
  if (!tagSnap.exists) return { cardsScrubbed: 0 };
  const oldName = tagSnap.data()?.name as string;

  const cardsSnap = await db
    .collection(cardsPath(wid))
    .where("tagIds", "array-contains", tagId)
    .get();

  let cardsScrubbed = 0;
  const chunks = chunkArray(cardsSnap.docs, BATCH_CHUNK);
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      const data = doc.data();
      batch.update(doc.ref, {
        tagIds: (data.tagIds ?? []).filter((id: string) => id !== tagId),
        tagNames: (data.tagNames ?? []).filter((n: string) => n !== oldName),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    await runParallelLimited(chunk, 4, async (doc) => {
      const after = await doc.ref.get();
      if (!after.exists) return;
      const data = after.data()!;
      if (data.deletedAt) return;
      await syncWithFallback(wid, "upsert", doc.id, toSummaryFromData(doc.id, data));
    });
    cardsScrubbed += chunk.length;
  }

  await tagRef.delete();
  return { cardsScrubbed };
}

// chunkArray and runParallelLimited are re-exported from ./_utils to keep
// behavior bit-identical and avoid duplication.
