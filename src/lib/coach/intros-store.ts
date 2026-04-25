import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

import type { IntroSuggestion } from "./intros";

const INTROS_SUBCOLLECTION = "intros";

interface CachedIntrosDoc {
  cacheKey: string;
  intros: IntroSuggestion[];
  generatedAt: Timestamp;
}

export async function readIntrosCache(
  uid: string,
  cacheKey: string,
): Promise<IntroSuggestion[] | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${INTROS_SUBCOLLECTION}/latest`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedIntrosDoc | undefined;
  if (!data) return null;
  if (data.cacheKey !== cacheKey) return null;
  return data.intros;
}

export async function writeIntrosCache(
  uid: string,
  cacheKey: string,
  intros: IntroSuggestion[],
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${INTROS_SUBCOLLECTION}/latest`);
  await ref.set({
    cacheKey,
    intros,
    generatedAt: Timestamp.now(),
  });
}
