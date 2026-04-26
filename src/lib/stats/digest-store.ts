import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

const STATS_SUBCOLLECTION = "stats";
const DIGEST_DOC = "digest";

interface CachedDigestDoc {
  cacheKey: string;
  digest: string;
  generatedAt: Timestamp;
}

export async function readDigestCache(uid: string, cacheKey: string): Promise<string | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${STATS_SUBCOLLECTION}/${DIGEST_DOC}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedDigestDoc | undefined;
  if (!data) return null;
  if (data.cacheKey !== cacheKey) return null;
  return data.digest;
}

export async function writeDigestCache(
  uid: string,
  cacheKey: string,
  digest: string,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${STATS_SUBCOLLECTION}/${DIGEST_DOC}`);
  await ref.set({
    cacheKey,
    digest,
    generatedAt: Timestamp.now(),
  });
}
