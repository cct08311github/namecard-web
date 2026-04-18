import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { MemberRole } from "@/db/schema";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { cardsPath, COLLECTION_WORKSPACES } from "@/lib/firebase/shared";
import { syncWithFallback } from "@/lib/search/reconcile";

import { toSummaryFromData } from "./cards-data";
import { chunkArray, runParallelLimited } from "./_utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemberSummary {
  uid: string;
  role: MemberRole;
  addedAt: Date | null;
  email?: string;
  displayName?: string;
}

export interface MemberMutationResult {
  cardsUpdated: number;
  /** Wall-clock milliseconds spent on the batched card sync. */
  elapsed: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BATCH_CHUNK = 400;

function workspaceRef(wid: string) {
  return getAdminFirestore().collection(COLLECTION_WORKSPACES).doc(wid);
}

/**
 * Sync all cards in a workspace where `memberUids` contains a given uid.
 * Used after invite or remove to update denormalized memberUids on card docs.
 *
 * @param wid          Workspace id
 * @param queryUid     The uid to filter on (array-contains)
 * @param buildUpdate  Called per card doc to produce the Firestore update payload
 * @param buildSummary Called per card doc (after write) to reindex in Typesense
 */
async function syncCardsForMemberChange(
  wid: string,
  queryUid: string,
  buildUpdate: (existing: string[]) => string[],
): Promise<{ cardsUpdated: number; elapsed: number }> {
  const db = getAdminFirestore();
  const t0 = Date.now();

  const snap = await db
    .collection(cardsPath(wid))
    .where("memberUids", "array-contains", queryUid)
    .get();

  let cardsUpdated = 0;
  const chunks = chunkArray(snap.docs, BATCH_CHUNK);

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      const existing: string[] = doc.data().memberUids ?? [];
      const next = buildUpdate(existing);
      batch.update(doc.ref, {
        memberUids: next,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // Reindex in Typesense after each chunk (parallel-limited to 4).
    await runParallelLimited(chunk, 4, async (doc) => {
      const after = await doc.ref.get();
      if (!after.exists) return;
      const data = after.data()!;
      if (data.deletedAt) return;
      await syncWithFallback(wid, "upsert", doc.id, toSummaryFromData(doc.id, data));
    });

    cardsUpdated += chunk.length;
  }

  return { cardsUpdated, elapsed: Date.now() - t0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List members of a workspace.
 * Caller must be a member; throws if not authorized.
 */
export async function listWorkspaceMembers(
  workspaceId: string,
  callerUid: string,
): Promise<MemberSummary[]> {
  const snap = await workspaceRef(workspaceId).get();
  if (!snap.exists) throw new Error("Workspace 不存在");

  const data = snap.data()!;
  const memberUids: string[] = data.memberUids ?? [];

  if (!memberUids.includes(callerUid)) {
    throw new Error("無存取權限");
  }

  // Look up Auth profiles in parallel (best-effort; missing profiles are OK).
  const auth = getAdminAuth();
  const profiles = await Promise.allSettled(memberUids.map((uid) => auth.getUser(uid)));

  const rolesMap = data.memberRoles as Record<string, MemberRole> | undefined;

  return memberUids.map((uid, i) => {
    const profile = profiles[i]?.status === "fulfilled" ? profiles[i].value : null;
    const role = rolesMap?.[uid] ?? (data.ownerUid === uid ? "owner" : "editor");
    const addedAtRaw = (data.memberAddedAt as Record<string, unknown> | undefined)?.[uid];
    const addedAt =
      addedAtRaw instanceof Date
        ? addedAtRaw
        : typeof addedAtRaw === "object" &&
            addedAtRaw !== null &&
            "toDate" in addedAtRaw &&
            typeof (addedAtRaw as { toDate: () => Date }).toDate === "function"
          ? (addedAtRaw as { toDate: () => Date }).toDate()
          : null;

    return {
      uid,
      role: role as MemberRole,
      addedAt,
      email: profile?.email,
      displayName: profile?.displayName,
    };
  });
}

/**
 * Invite a new member by email.
 * - Caller must be the owner.
 * - Invitee email must be in ALLOWED_EMAILS.
 * - Invitee must already have a Firebase Auth user.
 * - Idempotent if invitee is already a member.
 */
export async function inviteMemberByEmail(
  workspaceId: string,
  callerUid: string,
  inviteeEmail: string,
): Promise<MemberMutationResult> {
  // --- Auth lookup first (cheap, outside transaction) ---
  if (!isEmailAllowed(inviteeEmail)) {
    throw new Error("此 Email 不在系統白名單，請 admin 先加 ALLOWED_EMAILS 環境變數");
  }

  let inviteeUid: string;
  try {
    const record = await getAdminAuth().getUserByEmail(inviteeEmail);
    inviteeUid = record.uid;
  } catch {
    throw new Error("找不到此 Email 的使用者，請對方先登入一次");
  }

  // --- Transaction: authorize + update workspace doc ---
  const ref = workspaceRef(workspaceId);
  let alreadyMember = false;

  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Workspace 不存在");

    const data = snap.data()!;
    if (data.ownerUid !== callerUid) throw new Error("只有 owner 可以邀請成員");

    const memberUids: string[] = data.memberUids ?? [];
    if (memberUids.includes(inviteeUid)) {
      alreadyMember = true;
      return;
    }

    const rolesMap: Record<string, string> = {
      ...(data.memberRoles as Record<string, string> | undefined),
    };
    rolesMap[inviteeUid] = "editor";

    // Ensure owner also has a role entry (migration-safe).
    if (!rolesMap[data.ownerUid]) rolesMap[data.ownerUid] = "owner";

    tx.update(ref, {
      memberUids: [...memberUids, inviteeUid],
      memberRoles: rolesMap,
    });
  });

  if (alreadyMember) {
    return { cardsUpdated: 0, elapsed: 0 };
  }

  // --- Sync all of the owner's (caller's) cards to include the new member ---
  // We use the owner's uid as the query uid because all workspace cards carry
  // the owner's uid in memberUids already. This finds every card in the workspace.
  const { cardsUpdated, elapsed } = await syncCardsForMemberChange(
    workspaceId,
    callerUid,
    (existing) => (existing.includes(inviteeUid) ? existing : [...existing, inviteeUid]),
  );

  return { cardsUpdated, elapsed };
}

/**
 * Remove a member from a workspace.
 * - Caller must be the owner.
 * - Cannot remove the owner.
 * - Idempotent if target is not a member.
 */
export async function removeMember(
  workspaceId: string,
  callerUid: string,
  targetUid: string,
): Promise<MemberMutationResult> {
  const ref = workspaceRef(workspaceId);
  let wasNotMember = false;

  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Workspace 不存在");

    const data = snap.data()!;
    if (data.ownerUid !== callerUid) throw new Error("只有 owner 可以移除成員");
    if (targetUid === data.ownerUid) throw new Error("無法移除 owner");

    const memberUids: string[] = data.memberUids ?? [];
    if (!memberUids.includes(targetUid)) {
      wasNotMember = true;
      return;
    }

    const rolesMap: Record<string, string> = {
      ...(data.memberRoles as Record<string, string> | undefined),
    };
    delete rolesMap[targetUid];

    tx.update(ref, {
      memberUids: memberUids.filter((uid) => uid !== targetUid),
      memberRoles: rolesMap,
    });
  });

  if (wasNotMember) {
    return { cardsUpdated: 0, elapsed: 0 };
  }

  // Remove targetUid from all card memberUids arrays in this workspace.
  const { cardsUpdated, elapsed } = await syncCardsForMemberChange(
    workspaceId,
    targetUid,
    (existing) => existing.filter((uid) => uid !== targetUid),
  );

  return { cardsUpdated, elapsed };
}

/**
 * Transfer workspace ownership to an existing member.
 * - Caller must be the current owner.
 * - New owner must already be a member.
 * Card memberUids are unchanged (both users are already members).
 */
export async function transferOwnership(
  workspaceId: string,
  callerUid: string,
  newOwnerUid: string,
): Promise<MemberMutationResult> {
  const ref = workspaceRef(workspaceId);

  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Workspace 不存在");

    const data = snap.data()!;
    if (data.ownerUid !== callerUid) throw new Error("只有 owner 可以轉移所有權");

    const memberUids: string[] = data.memberUids ?? [];
    if (!memberUids.includes(newOwnerUid)) {
      throw new Error("新 owner 必須已經是成員");
    }

    const rolesMap: Record<string, string> = {
      ...(data.memberRoles as Record<string, string> | undefined),
    };
    rolesMap[newOwnerUid] = "owner";
    rolesMap[callerUid] = "editor";

    tx.update(ref, {
      ownerUid: newOwnerUid,
      memberRoles: rolesMap,
    });
  });

  // No card-level updates needed: both parties were already in memberUids.
  return { cardsUpdated: 0, elapsed: 0 };
}
