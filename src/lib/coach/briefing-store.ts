import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

import type { BriefingPick } from "./briefing";

const BRIEFING_SUBCOLLECTION = "briefing";

interface CachedBriefingDoc {
  cacheKey: string;
  picks: BriefingPick[];
  generatedAt: Timestamp;
}

/**
 * Look up the user's daily briefing for a given cache key. Returns null
 * on miss or when the stored cache key differs (e.g. candidate set
 * changed since this morning so the cached picks are stale).
 *
 * Stored at workspaces/{wid}/briefing/today (single doc — older
 * briefings aren't useful, fresh picks every day).
 */
export async function readBriefingCache(
  uid: string,
  cacheKey: string,
): Promise<BriefingPick[] | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${BRIEFING_SUBCOLLECTION}/today`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedBriefingDoc | undefined;
  if (!data) return null;
  if (data.cacheKey !== cacheKey) return null;
  return data.picks;
}

export async function writeBriefingCache(
  uid: string,
  cacheKey: string,
  picks: BriefingPick[],
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${BRIEFING_SUBCOLLECTION}/today`);
  await ref.set({
    cacheKey,
    picks,
    generatedAt: Timestamp.now(),
  });
}
