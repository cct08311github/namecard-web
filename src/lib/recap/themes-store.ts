import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

const RECAP_SUBCOLLECTION = "recap";
const THEMES_DOC = "themes";

interface CachedThemesDoc {
  cacheKey: string;
  themes: string[];
  generatedAt: Timestamp;
}

export async function readThemesCache(uid: string, cacheKey: string): Promise<string[] | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${RECAP_SUBCOLLECTION}/${THEMES_DOC}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedThemesDoc | undefined;
  if (!data) return null;
  if (data.cacheKey !== cacheKey) return null;
  return data.themes;
}

export async function writeThemesCache(
  uid: string,
  cacheKey: string,
  themes: string[],
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${RECAP_SUBCOLLECTION}/${THEMES_DOC}`);
  await ref.set({
    cacheKey,
    themes,
    generatedAt: Timestamp.now(),
  });
}
