import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { cardsPath, personalWorkspaceId } from "@/lib/firebase/shared";

import type { ReengageDrafts } from "./reengage";

const REENGAGE_SUBCOLLECTION = "reengage";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

interface CachedReengageDoc {
  hash: string;
  drafts: ReengageDrafts;
  generatedAt: Timestamp;
}

export async function readReengageCache(
  uid: string,
  cardId: string,
  hash: string,
): Promise<ReengageDrafts | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}/${REENGAGE_SUBCOLLECTION}/latest`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedReengageDoc | undefined;
  if (!data) return null;
  if (data.hash !== hash) return null;
  if (Date.now() - data.generatedAt.toMillis() > CACHE_TTL_MS) return null;
  return data.drafts;
}

export async function writeReengageCache(
  uid: string,
  cardId: string,
  hash: string,
  drafts: ReengageDrafts,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}/${REENGAGE_SUBCOLLECTION}/latest`);
  await ref.set({
    hash,
    drafts,
    generatedAt: Timestamp.now(),
  });
}
