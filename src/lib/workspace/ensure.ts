import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import { COLLECTION_WORKSPACES, personalWorkspaceId } from "@/lib/firebase/shared";

interface EnsureInput {
  uid: string;
  displayName?: string;
}

export interface PersonalWorkspace {
  id: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  createdAt: FirebaseFirestore.Timestamp | FieldValue;
}

/**
 * Idempotently ensure the user's personal workspace exists.
 * Personal workspace id is the user's uid (see AGENTS.md invariant #1).
 */
export async function ensurePersonalWorkspace({
  uid,
  displayName,
}: EnsureInput): Promise<PersonalWorkspace> {
  const db = getAdminFirestore();
  const wid = personalWorkspaceId(uid);
  const ref = db.collection(COLLECTION_WORKSPACES).doc(wid);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data();
    return {
      id: wid,
      ownerUid: (data?.ownerUid as string) ?? uid,
      memberUids: (data?.memberUids as string[]) ?? [uid],
      name: (data?.name as string) ?? "Personal",
      createdAt: data?.createdAt,
    };
  }
  const payload = {
    ownerUid: uid,
    memberUids: [uid],
    name: displayName ? `${displayName} 的名片冊` : "Personal",
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  return {
    id: wid,
    ...payload,
  };
}
