/**
 * SIT for ensurePersonalWorkspace against a real Firestore emulator.
 *
 * TDD order: tests written BEFORE validating the implementation. Any
 * divergence surfaces as a failing test to be investigated, not weakened.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  getSitFirestore,
  resetEmulators,
} from "@/test/firebase-emulator";
import { TEST_UID_ALICE, TEST_UID_BOB } from "@/test/fixtures";

describe("ensurePersonalWorkspace (SIT)", () => {
  let ensurePersonalWorkspace: typeof import("../ensure").ensurePersonalWorkspace;

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    ({ ensurePersonalWorkspace } = await import("../ensure"));
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  it("creates a new workspace when none exists", async () => {
    const result = await ensurePersonalWorkspace({ uid: TEST_UID_ALICE });

    expect(result.id).toBe(TEST_UID_ALICE);
    expect(result.ownerUid).toBe(TEST_UID_ALICE);
    expect(result.memberUids).toEqual([TEST_UID_ALICE]);
    expect(result.name).toBe("Personal");

    const snap = await getSitFirestore().collection("workspaces").doc(TEST_UID_ALICE).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.ownerUid).toBe(TEST_UID_ALICE);
  });

  it("uses '{displayName} 的名片冊' when displayName is provided", async () => {
    const result = await ensurePersonalWorkspace({
      uid: TEST_UID_ALICE,
      displayName: "Alice",
    });
    expect(result.name).toBe("Alice 的名片冊");

    const snap = await getSitFirestore().collection("workspaces").doc(TEST_UID_ALICE).get();
    expect(snap.data()?.name).toBe("Alice 的名片冊");
  });

  it("is idempotent: second call returns the existing workspace unchanged", async () => {
    const first = await ensurePersonalWorkspace({
      uid: TEST_UID_ALICE,
      displayName: "Alice",
    });
    const second = await ensurePersonalWorkspace({
      uid: TEST_UID_ALICE,
      displayName: "Alice Renamed", // re-login with updated profile
    });

    expect(second.id).toBe(first.id);
    expect(second.ownerUid).toBe(first.ownerUid);
    expect(second.memberUids).toEqual(first.memberUids);
    // Existing metadata is preserved on subsequent calls — this locks
    // the contract so a future "update on re-login" change is intentional.
    expect(second.name).toBe("Alice 的名片冊");
  });

  it("does not touch another user's workspace", async () => {
    await ensurePersonalWorkspace({ uid: TEST_UID_ALICE, displayName: "Alice" });
    await ensurePersonalWorkspace({ uid: TEST_UID_BOB, displayName: "Bob" });

    const db = getSitFirestore();
    const alice = await db.collection("workspaces").doc(TEST_UID_ALICE).get();
    const bob = await db.collection("workspaces").doc(TEST_UID_BOB).get();

    expect(alice.data()?.name).toBe("Alice 的名片冊");
    expect(bob.data()?.name).toBe("Bob 的名片冊");
    expect(alice.data()?.memberUids).toEqual([TEST_UID_ALICE]);
    expect(bob.data()?.memberUids).toEqual([TEST_UID_BOB]);
  });

  it("sets createdAt server timestamp on new workspace", async () => {
    await ensurePersonalWorkspace({ uid: TEST_UID_ALICE });
    const snap = await getSitFirestore().collection("workspaces").doc(TEST_UID_ALICE).get();
    const created = snap.data()?.createdAt;
    expect(created).toBeDefined();
    const millis = (created as { toMillis(): number }).toMillis();
    expect(Math.abs(Date.now() - millis)).toBeLessThan(10_000);
  });

  it("never promotes a user to owner of someone else's workspace", async () => {
    await ensurePersonalWorkspace({ uid: TEST_UID_BOB });

    const result = await ensurePersonalWorkspace({ uid: TEST_UID_ALICE });
    expect(result.id).toBe(TEST_UID_ALICE);
    expect(result.ownerUid).toBe(TEST_UID_ALICE);

    const bobDoc = await getSitFirestore().collection("workspaces").doc(TEST_UID_BOB).get();
    expect(bobDoc.data()?.ownerUid).toBe(TEST_UID_BOB);
    expect(bobDoc.data()?.memberUids).toEqual([TEST_UID_BOB]);
  });
});
