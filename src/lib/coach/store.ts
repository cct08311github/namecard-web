import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { cardsPath, personalWorkspaceId } from "@/lib/firebase/shared";

import type { CoachInsight } from "./insights";

const COACH_SUBCOLLECTION = "coach";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CachedCoachDoc {
  hash: string;
  insight: CoachInsight;
  generatedAt: Timestamp;
}

/**
 * Look up a previously-cached insight for the given card + context hash.
 * Returns null on miss, on cache expiry, or when the stored hash differs
 * (i.e. the user added a new event / updated the card so the prompt
 * inputs no longer match).
 */
export async function readCoachCache(
  uid: string,
  cardId: string,
  hash: string,
): Promise<CoachInsight | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}/${COACH_SUBCOLLECTION}/latest`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedCoachDoc | undefined;
  if (!data) return null;
  if (data.hash !== hash) return null;
  const ageMs = Date.now() - data.generatedAt.toMillis();
  if (ageMs > CACHE_TTL_MS) return null;
  return data.insight;
}

/**
 * Persist the latest insight under cards/{id}/coach/latest. Single-doc
 * (not append) — older insights aren't useful once the context shifts.
 */
export async function writeCoachCache(
  uid: string,
  cardId: string,
  hash: string,
  insight: CoachInsight,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}/${COACH_SUBCOLLECTION}/latest`);
  await ref.set({
    hash,
    insight,
    generatedAt: Timestamp.now(),
  });
}
