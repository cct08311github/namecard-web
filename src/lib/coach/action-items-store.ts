import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

import type { ActionItem } from "./action-items";

const COACH_SUBCOLLECTION = "coach";
const ACTION_ITEMS_DOC = "action-items";

interface CachedActionItemsDoc {
  cacheKey: string;
  items: ActionItem[];
  generatedAt: Timestamp;
}

export async function readActionItemsCache(
  uid: string,
  cacheKey: string,
): Promise<ActionItem[] | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${COACH_SUBCOLLECTION}/${ACTION_ITEMS_DOC}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as CachedActionItemsDoc | undefined;
  if (!data) return null;
  if (data.cacheKey !== cacheKey) return null;
  return data.items;
}

export async function writeActionItemsCache(
  uid: string,
  cacheKey: string,
  items: ActionItem[],
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${COLLECTION_WORKSPACES}/${wid}/${COACH_SUBCOLLECTION}/${ACTION_ITEMS_DOC}`);
  await ref.set({
    cacheKey,
    items,
    generatedAt: Timestamp.now(),
  });
}
