/**
 * SIT for src/db/cards.ts — the card repository.
 *
 * Covers all 6 repository functions against the live Firestore emulator:
 *   listCardsForUser, getCardForUser, createCardForUser,
 *   updateCardForUser, softDeleteCardForUser, touchLastContactedAt
 *
 * TDD order: every assertion was written BEFORE validating the implementation.
 * Divergence surfaces as a failing test we must investigate, not weaken.
 */
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  getSitFirestore,
  resetEmulators,
} from "@/test/firebase-emulator";
import { TEST_UID_ALICE, TEST_UID_BOB, aCard } from "@/test/fixtures";

/** Seed alice's personal workspace directly (bypasses app's ensure call) */
async function seedWorkspace(uid: string): Promise<void> {
  await getSitFirestore()
    .collection("workspaces")
    .doc(uid)
    .set({
      ownerUid: uid,
      memberUids: [uid],
      name: `${uid}'s space`,
      createdAt: Timestamp.now(),
    });
}

describe("cards repository (SIT)", () => {
  let repo: typeof import("../cards");

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    repo = await import("../cards");
  });

  beforeEach(async () => {
    await resetEmulators();
    await seedWorkspace(TEST_UID_ALICE);
    await seedWorkspace(TEST_UID_BOB);
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  describe("createCardForUser", () => {
    it("writes card under workspaces/{uid}/cards/{autoId}", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      expect(id).toMatch(/^[A-Za-z0-9]{10,}$/);

      const snap = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      expect(snap.exists).toBe(true);
    });

    it("denormalizes ownerUid / workspaceId / memberUids=[uid]", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const doc = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      const data = doc.data()!;
      expect(data.ownerUid).toBe(TEST_UID_ALICE);
      expect(data.workspaceId).toBe(TEST_UID_ALICE);
      expect(data.memberUids).toEqual([TEST_UID_ALICE]);
    });

    it("sets createdAt + updatedAt server timestamps and deletedAt=null", async () => {
      const before = Date.now();
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const after = Date.now();

      const data = (
        await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get()
      ).data()!;
      const created = (data.createdAt as Timestamp).toMillis();
      const updated = (data.updatedAt as Timestamp).toMillis();
      expect(created).toBeGreaterThanOrEqual(before - 1000);
      expect(created).toBeLessThanOrEqual(after + 1000);
      expect(updated).toBe(created);
      expect(data.deletedAt).toBeNull();
    });

    it("persists whyRemember + name fields verbatim", async () => {
      const input = aCard({
        whyRemember: "一起在 CES 走了三個小時展場",
        nameZh: "王小明",
        nameEn: "Ming Wang",
      });
      const { id } = await repo.createCardForUser(input, { uid: TEST_UID_ALICE });
      const data = (
        await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get()
      ).data()!;
      expect(data.whyRemember).toBe("一起在 CES 走了三個小時展場");
      expect(data.nameZh).toBe("王小明");
      expect(data.nameEn).toBe("Ming Wang");
    });
  });

  describe("getCardForUser", () => {
    it("returns the card when uid is a member", async () => {
      const { id } = await repo.createCardForUser(aCard({ nameEn: "Alice" }), {
        uid: TEST_UID_ALICE,
      });
      const card = await repo.getCardForUser(TEST_UID_ALICE, id);
      expect(card?.id).toBe(id);
      expect(card?.nameEn).toBe("Alice");
      expect(card?.ownerUid).toBe(TEST_UID_ALICE);
    });

    it("returns null when card does not exist", async () => {
      const card = await repo.getCardForUser(TEST_UID_ALICE, "does-not-exist");
      expect(card).toBeNull();
    });

    it("returns null when uid is not in memberUids (cross-user protection)", async () => {
      // alice creates a card; bob tries to read through his personal path.
      // Our getCardForUser(uid, cardId) resolves by personalWorkspaceId(uid)
      // which is bob's workspace — card doesn't exist there → null.
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const asBob = await repo.getCardForUser(TEST_UID_BOB, id);
      expect(asBob).toBeNull();
    });

    it("converts server Timestamps back to Date objects", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const card = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
      expect(card.createdAt).toBeInstanceOf(Date);
      expect(card.updatedAt).toBeInstanceOf(Date);
      expect(card.lastContactedAt).toBeNull();
      expect(card.deletedAt).toBeNull();
    });
  });

  describe("listCardsForUser", () => {
    it("returns alice's cards ordered by createdAt desc by default", async () => {
      const a = await repo.createCardForUser(aCard({ nameEn: "One" }), {
        uid: TEST_UID_ALICE,
      });
      await new Promise((r) => setTimeout(r, 10));
      const b = await repo.createCardForUser(aCard({ nameEn: "Two" }), {
        uid: TEST_UID_ALICE,
      });
      await new Promise((r) => setTimeout(r, 10));
      const c = await repo.createCardForUser(aCard({ nameEn: "Three" }), {
        uid: TEST_UID_ALICE,
      });

      const list = await repo.listCardsForUser(TEST_UID_ALICE);
      expect(list.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    });

    it("excludes soft-deleted cards by default", async () => {
      const keep = await repo.createCardForUser(aCard({ nameEn: "Keep" }), {
        uid: TEST_UID_ALICE,
      });
      const drop = await repo.createCardForUser(aCard({ nameEn: "Drop" }), {
        uid: TEST_UID_ALICE,
      });
      await repo.softDeleteCardForUser(drop.id, { uid: TEST_UID_ALICE });

      const list = await repo.listCardsForUser(TEST_UID_ALICE);
      const ids = list.map((x) => x.id);
      expect(ids).toContain(keep.id);
      expect(ids).not.toContain(drop.id);
    });

    it("does not leak other users' cards (memberUids array-contains filter)", async () => {
      await repo.createCardForUser(aCard({ nameEn: "Alice card" }), {
        uid: TEST_UID_ALICE,
      });
      await repo.createCardForUser(aCard({ nameEn: "Bob card" }), {
        uid: TEST_UID_BOB,
      });

      const aliceList = await repo.listCardsForUser(TEST_UID_ALICE);
      const bobList = await repo.listCardsForUser(TEST_UID_BOB);
      expect(aliceList.map((c) => c.nameEn)).toEqual(["Alice card"]);
      expect(bobList.map((c) => c.nameEn)).toEqual(["Bob card"]);
    });

    it("respects limit option", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.createCardForUser(aCard({ nameEn: `card-${i}` }), {
          uid: TEST_UID_ALICE,
        });
      }
      const list = await repo.listCardsForUser(TEST_UID_ALICE, { limit: 2 });
      expect(list).toHaveLength(2);
    });

    it("includes soft-deleted when includeDeleted=true", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.softDeleteCardForUser(id, { uid: TEST_UID_ALICE });

      const withDeleted = await repo.listCardsForUser(TEST_UID_ALICE, {
        includeDeleted: true,
      });
      expect(withDeleted.some((c) => c.id === id)).toBe(true);
    });
  });

  describe("updateCardForUser", () => {
    it("updates whyRemember and refreshes updatedAt", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const original = (await repo.getCardForUser(TEST_UID_ALICE, id))!;

      await new Promise((r) => setTimeout(r, 25));
      await repo.updateCardForUser(id, { whyRemember: "更新的理由" }, { uid: TEST_UID_ALICE });

      const updated = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
      expect(updated.whyRemember).toBe("更新的理由");
      expect(updated.updatedAt!.getTime()).toBeGreaterThan(original.updatedAt!.getTime());
      expect(updated.createdAt!.getTime()).toBe(original.createdAt!.getTime());
    });

    it("preserves ownerUid / workspaceId / memberUids even if client sends rogue values", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.updateCardForUser(
        id,
        // Cast: emulate a malicious client bypassing Zod on the wire.
        {
          ownerUid: TEST_UID_BOB,
          memberUids: [TEST_UID_BOB, TEST_UID_ALICE],
          workspaceId: "evil",
          whyRemember: "try to escalate",
        } as unknown as import("../schema").CardUpdateInput,
        { uid: TEST_UID_ALICE },
      );

      const card = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
      expect(card.ownerUid).toBe(TEST_UID_ALICE);
      expect(card.workspaceId).toBe(TEST_UID_ALICE);
      expect(card.memberUids).toEqual([TEST_UID_ALICE]);
      expect(card.whyRemember).toBe("try to escalate");
    });

    it("throws when card does not exist", async () => {
      await expect(
        repo.updateCardForUser("nope", { whyRemember: "x" }, { uid: TEST_UID_ALICE }),
      ).rejects.toThrow(/名片不存在/);
    });

    it("throws when caller is not a member", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await expect(
        repo.updateCardForUser(id, { whyRemember: "x" }, { uid: TEST_UID_BOB }),
      ).rejects.toThrow(/無權限修改/);
    });
  });

  describe("softDeleteCardForUser", () => {
    it("sets deletedAt and excludes from default listing", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.softDeleteCardForUser(id, { uid: TEST_UID_ALICE });

      const card = await repo.getCardForUser(TEST_UID_ALICE, id);
      expect(card?.deletedAt).toBeInstanceOf(Date);

      const list = await repo.listCardsForUser(TEST_UID_ALICE);
      expect(list.some((c) => c.id === id)).toBe(false);
    });

    it("throws when card does not exist", async () => {
      await expect(repo.softDeleteCardForUser("nope", { uid: TEST_UID_ALICE })).rejects.toThrow(
        /名片不存在/,
      );
    });

    it("throws when caller is not a member", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await expect(repo.softDeleteCardForUser(id, { uid: TEST_UID_BOB })).rejects.toThrow(
        /無權限刪除/,
      );
    });
  });

  describe("touchLastContactedAt", () => {
    it("updates lastContactedAt + updatedAt to server time", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });

      const before = Date.now();
      await repo.touchLastContactedAt(id, { uid: TEST_UID_ALICE });
      const after = Date.now();

      const card = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
      expect(card.lastContactedAt).toBeInstanceOf(Date);
      const ms = card.lastContactedAt!.getTime();
      expect(ms).toBeGreaterThanOrEqual(before - 1000);
      expect(ms).toBeLessThanOrEqual(after + 1000);
    });

    it("is safe to call multiple times (moves the timestamp forward)", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.touchLastContactedAt(id, { uid: TEST_UID_ALICE });
      const first = (await repo.getCardForUser(TEST_UID_ALICE, id))!.lastContactedAt!;

      await new Promise((r) => setTimeout(r, 25));
      await repo.touchLastContactedAt(id, { uid: TEST_UID_ALICE });
      const second = (await repo.getCardForUser(TEST_UID_ALICE, id))!.lastContactedAt!;

      expect(second.getTime()).toBeGreaterThan(first.getTime());
    });
  });
});
