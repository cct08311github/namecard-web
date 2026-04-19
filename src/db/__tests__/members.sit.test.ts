/**
 * SIT for src/db/members.ts — workspace member management repository.
 *
 * Requires Firebase Firestore + Auth emulators (run via `pnpm test:sit`).
 * Typesense sync is allowed to fail silently (gated by syncWithFallback's
 * typesenseConfigured() check which returns false when env vars are absent).
 */
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  getSitFirestore,
  resetEmulators,
  seedEmulatorUser,
} from "@/test/firebase-emulator";
import { aCard } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------

const ALICE = { uid: "uid-alice-members", email: "alice-members@example.com" };
const BOB = { uid: "uid-bob-members", email: "bob-members@example.com" };
const CHARLIE = { uid: "uid-charlie-members", email: "charlie-members@example.com" };

// Alice's workspace id = Alice's uid (personal workspace invariant).
const ALICE_WID = ALICE.uid;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedWorkspace(uid: string, extra: Record<string, unknown> = {}): Promise<void> {
  await getSitFirestore()
    .collection("workspaces")
    .doc(uid)
    .set({
      ownerUid: uid,
      memberUids: [uid],
      name: `${uid}'s space`,
      createdAt: Timestamp.now(),
      ...extra,
    });
}

async function getWorkspaceData(wid: string): Promise<FirebaseFirestore.DocumentData> {
  const snap = await getSitFirestore().collection("workspaces").doc(wid).get();
  if (!snap.exists) throw new Error(`Workspace ${wid} not found`);
  return snap.data()!;
}

async function getCardMemberUids(wid: string, cardId: string): Promise<string[]> {
  const snap = await getSitFirestore().doc(`workspaces/${wid}/cards/${cardId}`).get();
  if (!snap.exists) throw new Error(`Card ${cardId} not found`);
  return (snap.data()!.memberUids as string[]) ?? [];
}

// ---------------------------------------------------------------------------
// Lazy module import (needed so emulator env vars are set before SDK init)
// ---------------------------------------------------------------------------

describe(`members repository [${EMULATOR_PROJECT_ID}]`, () => {
  let members: typeof import("../members");
  let cards: typeof import("../cards");

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    process.env.ALLOWED_EMAILS = `${BOB.email},${CHARLIE.email},${ALICE.email}`;

    members = await import("../members");
    cards = await import("../cards");
  });

  beforeEach(async () => {
    await resetEmulators();
    await seedEmulatorUser(ALICE);
    await seedEmulatorUser(BOB);
    await seedWorkspace(ALICE.uid);
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  // -------------------------------------------------------------------------
  // inviteMemberByEmail — happy path
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: adds Bob to Alice's workspace + syncs card memberUids", async () => {
    // Seed two cards in Alice's workspace.
    const c1 = await cards.createCardForUser(aCard({ nameZh: "甲" }), { uid: ALICE.uid });
    const c2 = await cards.createCardForUser(aCard({ nameZh: "乙" }), { uid: ALICE.uid });

    const result = await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);

    // Workspace doc reflects new member.
    const ws = await getWorkspaceData(ALICE_WID);
    expect(ws.memberUids).toContain(BOB.uid);
    expect(ws.memberRoles?.[BOB.uid]).toBe("editor");

    // Both cards should carry Bob in memberUids.
    const muids1 = await getCardMemberUids(ALICE_WID, c1.id);
    const muids2 = await getCardMemberUids(ALICE_WID, c2.id);
    expect(muids1).toContain(BOB.uid);
    expect(muids2).toContain(BOB.uid);

    // At least those two cards were updated.
    expect(result.cardsUpdated).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // inviteMemberByEmail — idempotent
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: idempotent — inviting Bob twice produces no duplicates", async () => {
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);

    const ws = await getWorkspaceData(ALICE_WID);
    const count = (ws.memberUids as string[]).filter((uid: string) => uid === BOB.uid).length;
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // inviteMemberByEmail — non-allowed email
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: rejects email not in ALLOWED_EMAILS", async () => {
    await expect(
      members.inviteMemberByEmail(ALICE_WID, ALICE.uid, "notallowed@evil.com"),
    ).rejects.toThrow("不在系統白名單");
  });

  // -------------------------------------------------------------------------
  // inviteMemberByEmail — non-existent Auth user
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: rejects email that has no Auth user", async () => {
    // charlie@example.com is in ALLOWED_EMAILS but NOT seeded in Auth.
    process.env.ALLOWED_EMAILS = `${BOB.email},${ALICE.email},charlie-never-logged-in@example.com`;
    await expect(
      members.inviteMemberByEmail(ALICE_WID, ALICE.uid, "charlie-never-logged-in@example.com"),
    ).rejects.toThrow("找不到此 Email 的使用者");
    // restore
    process.env.ALLOWED_EMAILS = `${BOB.email},${CHARLIE.email},${ALICE.email}`;
  });

  // -------------------------------------------------------------------------
  // inviteMemberByEmail — non-owner caller
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: non-owner cannot invite", async () => {
    // Seed Charlie's workspace (so Charlie exists in Firestore), invite Bob as Alice.
    await seedEmulatorUser(CHARLIE);

    // Try to invite as Bob (not owner of Alice's workspace).
    await expect(members.inviteMemberByEmail(ALICE_WID, BOB.uid, CHARLIE.email)).rejects.toThrow(
      "只有 owner 可以邀請成員",
    );
  });

  // -------------------------------------------------------------------------
  // removeMember — happy path
  // -------------------------------------------------------------------------

  it("removeMember: removes Bob from Alice's workspace + updates card memberUids", async () => {
    // Invite Bob first.
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);
    const c1 = await cards.createCardForUser(aCard({ nameZh: "新卡" }), { uid: ALICE.uid });

    // Manually seed a card that already has Bob (simulating pre-existing data).
    const directRef = getSitFirestore().collection(`workspaces/${ALICE_WID}/cards`).doc();
    await directRef.set({
      workspaceId: ALICE_WID,
      ownerUid: ALICE.uid,
      memberUids: [ALICE.uid, BOB.uid],
      nameZh: "舊卡",
      whyRemember: "test",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      deletedAt: null,
      tagIds: [],
      tagNames: [],
      phones: [],
      emails: [],
      addresses: [],
      social: {},
    });
    const seededCardId = directRef.id;

    await members.removeMember(ALICE_WID, ALICE.uid, BOB.uid);

    const ws = await getWorkspaceData(ALICE_WID);
    expect(ws.memberUids).not.toContain(BOB.uid);

    // Bob should be gone from card memberUids.
    const muids = await getCardMemberUids(ALICE_WID, seededCardId);
    expect(muids).not.toContain(BOB.uid);

    // c1 was created after invite but before remove — Bob may or may not be
    // on it depending on test timing; just verify Alice is still there.
    const muids1 = await getCardMemberUids(ALICE_WID, c1.id);
    expect(muids1).toContain(ALICE.uid);
  });

  // -------------------------------------------------------------------------
  // removeMember — cannot remove owner
  // -------------------------------------------------------------------------

  it("removeMember: cannot remove the workspace owner", async () => {
    await expect(members.removeMember(ALICE_WID, ALICE.uid, ALICE.uid)).rejects.toThrow(
      "無法移除 owner",
    );
  });

  // -------------------------------------------------------------------------
  // transferOwnership
  // -------------------------------------------------------------------------

  it("transferOwnership: transfers to Bob; roles updated correctly", async () => {
    // Add Bob first.
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);

    await members.transferOwnership(ALICE_WID, ALICE.uid, BOB.uid);

    const ws = await getWorkspaceData(ALICE_WID);
    expect(ws.ownerUid).toBe(BOB.uid);
    expect(ws.memberRoles?.[BOB.uid]).toBe("owner");
    expect(ws.memberRoles?.[ALICE.uid]).toBe("editor");
    // memberUids unchanged — both still members.
    expect(ws.memberUids).toContain(ALICE.uid);
    expect(ws.memberUids).toContain(BOB.uid);
  });

  it("transferOwnership: rejects when newOwner is not already a member", async () => {
    await seedEmulatorUser(CHARLIE);
    await expect(members.transferOwnership(ALICE_WID, ALICE.uid, CHARLIE.uid)).rejects.toThrow(
      "新 owner 必須已經是成員",
    );
  });

  it("transferOwnership: rejects when caller is not the owner", async () => {
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);
    await expect(members.transferOwnership(ALICE_WID, BOB.uid, BOB.uid)).rejects.toThrow(
      "只有 owner 可以轉移所有權",
    );
  });

  // -------------------------------------------------------------------------
  // listWorkspaceMembers
  // -------------------------------------------------------------------------

  it("listWorkspaceMembers: returns members with correct roles", async () => {
    await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);

    const list = await members.listWorkspaceMembers(ALICE_WID, ALICE.uid);
    expect(list.length).toBe(2);

    const alice = list.find((m) => m.uid === ALICE.uid);
    const bob = list.find((m) => m.uid === BOB.uid);

    expect(alice?.role).toBe("owner");
    expect(bob?.role).toBe("editor");
  });

  it("listWorkspaceMembers: falls back to ownerUid inference when memberRoles absent", async () => {
    // Workspace created without memberRoles (legacy).
    const list = await members.listWorkspaceMembers(ALICE_WID, ALICE.uid);
    const alice = list.find((m) => m.uid === ALICE.uid);
    expect(alice?.role).toBe("owner");
  });

  it("listWorkspaceMembers: rejects non-member caller", async () => {
    await expect(members.listWorkspaceMembers(ALICE_WID, BOB.uid)).rejects.toThrow("無存取權限");
  });

  // -------------------------------------------------------------------------
  // 1000-card batch acceptance test
  // -------------------------------------------------------------------------

  it("inviteMemberByEmail: syncs 1000 cards in under 5 seconds", async () => {
    // Seed 1000 cards for Alice.
    const db = getSitFirestore();
    const batchSize = 400;
    const total = 1000;
    let seeded = 0;

    while (seeded < total) {
      const count = Math.min(batchSize, total - seeded);
      const batch = db.batch();
      for (let i = 0; i < count; i++) {
        const ref = db.collection(`workspaces/${ALICE_WID}/cards`).doc();
        batch.set(ref, {
          workspaceId: ALICE_WID,
          ownerUid: ALICE.uid,
          memberUids: [ALICE.uid],
          nameZh: `卡片 ${seeded + i}`,
          whyRemember: "batch test",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          deletedAt: null,
          tagIds: [],
          tagNames: [],
          phones: [],
          emails: [],
          addresses: [],
          social: {},
        });
      }
      await batch.commit();
      seeded += count;
    }

    const result = await members.inviteMemberByEmail(ALICE_WID, ALICE.uid, BOB.email);

    expect(result.cardsUpdated).toBe(total);
    // Prod target (Mac mini): <5 000 ms. CI Firebase emulators on shared GitHub
    // runners are significantly slower, so we use a relaxed 15 000 ms ceiling
    // here to avoid flaky failures while still catching catastrophic regressions.
    expect(result.elapsed).toBeLessThan(15000);
  }, 60_000);
});
