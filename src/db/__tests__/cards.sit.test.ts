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
      // In a personal-only workspace model (wid === uid), bob querying
      // alice's cardId in HIS own workspace returns "not found" before
      // the memberUids guard fires. Both branches block bob from writes,
      // so accept either.
      await expect(
        repo.updateCardForUser(id, { whyRemember: "x" }, { uid: TEST_UID_BOB }),
      ).rejects.toThrow(/無權限修改|名片不存在/);
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
      // See updateCardForUser counterpart — wid redirect fires "not found"
      // first in the personal-workspace model. Accept either error.
      await expect(repo.softDeleteCardForUser(id, { uid: TEST_UID_BOB })).rejects.toThrow(
        /無權限刪除|名片不存在/,
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

  describe("bulkUpdateCardsForUser", () => {
    it("adds tags to many cards in one go (deduped)", async () => {
      const a = await repo.createCardForUser(aCard({ tagIds: ["t1"] }), {
        uid: TEST_UID_ALICE,
      });
      const b = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });

      const result = await repo.bulkUpdateCardsForUser(TEST_UID_ALICE, [a.id, b.id], {
        addTagIds: ["t1", "t2"],
        addTagNames: ["客戶"],
      });
      expect(result.updated).toBe(2);

      const aCardAfter = (await repo.getCardForUser(TEST_UID_ALICE, a.id))!;
      const bCardAfter = (await repo.getCardForUser(TEST_UID_ALICE, b.id))!;
      // a kept t1 (no dup) + got t2 + got "客戶"
      expect(aCardAfter.tagIds.sort()).toEqual(["t1", "t2"]);
      expect(aCardAfter.tagNames).toContain("客戶");
      expect(bCardAfter.tagIds.sort()).toEqual(["t1", "t2"]);
    });

    it("sets firstMetEventTag and isPinned in one batch", async () => {
      const a = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const b = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.bulkUpdateCardsForUser(TEST_UID_ALICE, [a.id, b.id], {
        setEventTag: "2024 COMPUTEX",
        setPinned: true,
      });
      for (const id of [a.id, b.id]) {
        const card = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
        expect(card.firstMetEventTag).toBe("2024 COMPUTEX");
        expect(card.isPinned).toBe(true);
      }
    });

    it("skips cards the caller is not a member of (cross-user safety)", async () => {
      const a = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const bobCard = await repo.createCardForUser(aCard(), { uid: TEST_UID_BOB });

      const result = await repo.bulkUpdateCardsForUser(TEST_UID_ALICE, [a.id, bobCard.id], {
        setPinned: true,
      });
      // bob's card should be invisible / unaffected — alice's reach is her workspace.
      expect(result.updated).toBe(1);
    });

    it("skips soft-deleted cards", async () => {
      const a = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const b = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.softDeleteCardForUser(b.id, { uid: TEST_UID_ALICE });

      const result = await repo.bulkUpdateCardsForUser(TEST_UID_ALICE, [a.id, b.id], {
        setPinned: true,
      });
      expect(result.updated).toBe(1);
    });

    it("noops on empty ids", async () => {
      const result = await repo.bulkUpdateCardsForUser(TEST_UID_ALICE, [], { setPinned: true });
      expect(result.updated).toBe(0);
    });
  });

  describe("bulkSoftDeleteCardsForUser", () => {
    it("soft-deletes the requested cards", async () => {
      const a = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const b = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });

      const result = await repo.bulkSoftDeleteCardsForUser(TEST_UID_ALICE, [a.id, b.id]);
      expect(result.deleted).toBe(2);

      const list = await repo.listCardsForUser(TEST_UID_ALICE);
      expect(list.map((c) => c.id)).not.toContain(a.id);
      expect(list.map((c) => c.id)).not.toContain(b.id);
    });

    it("does not affect cards owned by other users", async () => {
      const aliceCard = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const bobCard = await repo.createCardForUser(aCard(), { uid: TEST_UID_BOB });

      await repo.bulkSoftDeleteCardsForUser(TEST_UID_ALICE, [aliceCard.id, bobCard.id]);

      const bobList = await repo.listCardsForUser(TEST_UID_BOB);
      expect(bobList.map((c) => c.id)).toContain(bobCard.id);
    });
  });

  describe("getCardsBySharedEvent", () => {
    it("returns other cards with the same firstMetEventTag, excluding self", async () => {
      const a = await repo.createCardForUser(
        aCard({ firstMetEventTag: "2024 COMPUTEX", whyRemember: "a" }),
        { uid: TEST_UID_ALICE },
      );
      const b = await repo.createCardForUser(
        aCard({ firstMetEventTag: "2024 COMPUTEX", whyRemember: "b" }),
        { uid: TEST_UID_ALICE },
      );
      const c = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Other Event", whyRemember: "c" }),
        { uid: TEST_UID_ALICE },
      );

      const others = await repo.getCardsBySharedEvent(TEST_UID_ALICE, "2024 COMPUTEX", a.id);
      const ids = others.map((card) => card.id);
      expect(ids).toContain(b.id);
      expect(ids).not.toContain(a.id);
      expect(ids).not.toContain(c.id);
    });

    it("respects the limit", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.createCardForUser(
          aCard({ firstMetEventTag: "Big Event", whyRemember: `c${i}` }),
          { uid: TEST_UID_ALICE },
        );
      }
      const seed = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Big Event", whyRemember: "seed" }),
        { uid: TEST_UID_ALICE },
      );
      const result = await repo.getCardsBySharedEvent(TEST_UID_ALICE, "Big Event", seed.id, 3);
      expect(result).toHaveLength(3);
    });

    it("returns empty when eventTag is empty / whitespace", async () => {
      const a = await repo.createCardForUser(aCard({ firstMetEventTag: "" }), {
        uid: TEST_UID_ALICE,
      });
      expect(await repo.getCardsBySharedEvent(TEST_UID_ALICE, "", a.id)).toEqual([]);
      expect(await repo.getCardsBySharedEvent(TEST_UID_ALICE, "   ", a.id)).toEqual([]);
    });

    it("does not leak across users (memberUids isolation)", async () => {
      const aliceCard = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Shared Event Name" }),
        { uid: TEST_UID_ALICE },
      );
      const bobCard = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Shared Event Name" }),
        { uid: TEST_UID_BOB },
      );

      const aliceSees = await repo.getCardsBySharedEvent(
        TEST_UID_ALICE,
        "Shared Event Name",
        aliceCard.id,
      );
      expect(aliceSees.map((c) => c.id)).not.toContain(bobCard.id);
    });

    it("excludes soft-deleted cards", async () => {
      const a = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Tag X", whyRemember: "a" }),
        { uid: TEST_UID_ALICE },
      );
      const b = await repo.createCardForUser(
        aCard({ firstMetEventTag: "Tag X", whyRemember: "b" }),
        { uid: TEST_UID_ALICE },
      );
      await repo.softDeleteCardForUser(b.id, { uid: TEST_UID_ALICE });
      const others = await repo.getCardsBySharedEvent(TEST_UID_ALICE, "Tag X", a.id);
      expect(others.map((c) => c.id)).not.toContain(b.id);
    });
  });

  describe("setCardPinned", () => {
    it("flips isPinned on and off", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.setCardPinned(id, TEST_UID_ALICE, true);
      expect((await repo.getCardForUser(TEST_UID_ALICE, id))!.isPinned).toBe(true);
      await repo.setCardPinned(id, TEST_UID_ALICE, false);
      expect((await repo.getCardForUser(TEST_UID_ALICE, id))!.isPinned).toBe(false);
    });

    it("refuses to pin a card the caller doesn't own", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await expect(repo.setCardPinned(id, TEST_UID_BOB, true)).rejects.toThrow();
    });
  });

  describe("logContactEvent + listContactEventsForUser", () => {
    it("appends an event and bumps lastContactedAt in one atomic write", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const before = Date.now();
      const eventId = await repo.logContactEvent(id, {
        uid: TEST_UID_ALICE,
        note: "發了 proposal",
        authorDisplay: "Alice",
      });
      expect(eventId).toMatch(/^[A-Za-z0-9]+$/);

      const events = await repo.listContactEventsForUser(id, TEST_UID_ALICE);
      expect(events).toHaveLength(1);
      expect(events[0].note).toBe("發了 proposal");
      expect(events[0].authorDisplay).toBe("Alice");
      expect(events[0].authorUid).toBe(TEST_UID_ALICE);
      expect(events[0].at.getTime()).toBeGreaterThanOrEqual(before - 1000);

      const card = (await repo.getCardForUser(TEST_UID_ALICE, id))!;
      expect(card.lastContactedAt).toBeInstanceOf(Date);
    });

    it("allows empty note and preserves author=null", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE });
      const events = await repo.listContactEventsForUser(id, TEST_UID_ALICE);
      expect(events[0].note).toBe("");
      expect(events[0].authorDisplay).toBeNull();
    });

    it("truncates notes beyond 500 characters", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const long = "a".repeat(600);
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE, note: long });
      const events = await repo.listContactEventsForUser(id, TEST_UID_ALICE);
      expect(events[0].note).toHaveLength(500);
    });

    it("returns events newest-first", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE, note: "first" });
      await new Promise((r) => setTimeout(r, 25));
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE, note: "second" });
      await new Promise((r) => setTimeout(r, 25));
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE, note: "third" });

      const events = await repo.listContactEventsForUser(id, TEST_UID_ALICE);
      expect(events.map((e) => e.note)).toEqual(["third", "second", "first"]);
    });

    it("refuses to log on a card the caller doesn't own", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await expect(
        repo.logContactEvent(id, { uid: TEST_UID_BOB, note: "intruder" }),
      ).rejects.toThrow();
    });

    it("returns empty list when caller has no access", async () => {
      const { id } = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await repo.logContactEvent(id, { uid: TEST_UID_ALICE, note: "private" });
      const events = await repo.listContactEventsForUser(id, TEST_UID_BOB);
      expect(events).toEqual([]);
    });
  });

  describe("mergeCardsForUser", () => {
    it("unions phones / emails / tags from merged into keep (deduped)", async () => {
      const keep = await repo.createCardForUser(
        aCard({
          phones: [{ label: "mobile", value: "0900-111-222" }],
          emails: [{ label: "work", value: "k@x.com" }],
          tagIds: ["t1"],
          tagNames: ["客戶"],
        }),
        { uid: TEST_UID_ALICE },
      );
      const dup = await repo.createCardForUser(
        aCard({
          phones: [
            { label: "mobile", value: "0900-111-222" }, // dup → drop
            { label: "office", value: "02-1234-5678" }, // new → keep
          ],
          emails: [{ label: "personal", value: "k@y.com" }],
          tagIds: ["t1", "t2"],
          tagNames: ["VIP"],
        }),
        { uid: TEST_UID_ALICE },
      );

      const result = await repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, [dup.id]);
      expect(result.merged).toBe(1);

      const after = (await repo.getCardForUser(TEST_UID_ALICE, keep.id))!;
      expect(after.phones.map((p) => p.value).sort()).toEqual(
        ["0900-111-222", "02-1234-5678"].sort(),
      );
      expect(after.emails.map((e) => e.value).sort()).toEqual(["k@x.com", "k@y.com"].sort());
      expect(after.tagIds.sort()).toEqual(["t1", "t2"]);
      expect(after.tagNames.sort()).toEqual(["VIP", "客戶"]);
    });

    it("appends provenance-tagged notes from merged cards", async () => {
      const keep = await repo.createCardForUser(aCard({ notes: "原本的備註" }), {
        uid: TEST_UID_ALICE,
      });
      const dup = await repo.createCardForUser(
        aCard({
          whyRemember: "Computex 偶遇",
          notes: "想找他做合作",
        }),
        { uid: TEST_UID_ALICE },
      );
      await repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, [dup.id]);
      const after = (await repo.getCardForUser(TEST_UID_ALICE, keep.id))!;
      expect(after.notes).toContain("原本的備註");
      expect(after.notes).toContain("【併入：Computex 偶遇】");
      expect(after.notes).toContain("想找他做合作");
    });

    it("takes max(lastContactedAt) across keep + merged", async () => {
      const keep = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const dup = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });

      // Touch dup more recently than keep.
      await repo.touchLastContactedAt(keep.id, { uid: TEST_UID_ALICE });
      await new Promise((r) => setTimeout(r, 50));
      await repo.touchLastContactedAt(dup.id, { uid: TEST_UID_ALICE });

      const dupCardBefore = (await repo.getCardForUser(TEST_UID_ALICE, dup.id))!;
      const dupContactedAt = dupCardBefore.lastContactedAt!.getTime();

      await repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, [dup.id]);

      const after = (await repo.getCardForUser(TEST_UID_ALICE, keep.id))!;
      expect(after.lastContactedAt).not.toBeNull();
      expect(after.lastContactedAt!.getTime()).toBe(dupContactedAt);
    });

    it("soft-deletes the merged cards (keep stays live)", async () => {
      const keep = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const dup1 = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const dup2 = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });

      await repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, [dup1.id, dup2.id]);

      const list = await repo.listCardsForUser(TEST_UID_ALICE);
      const visibleIds = list.map((c) => c.id);
      expect(visibleIds).toContain(keep.id);
      expect(visibleIds).not.toContain(dup1.id);
      expect(visibleIds).not.toContain(dup2.id);
    });

    it("refuses cross-user merges (throws when caller isn't a member)", async () => {
      const aliceKeep = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const bobCard = await repo.createCardForUser(aCard(), { uid: TEST_UID_BOB });

      await expect(
        repo.mergeCardsForUser(TEST_UID_ALICE, aliceKeep.id, [bobCard.id]),
      ).rejects.toThrow();
      // Bob's card stays live in his workspace.
      const bobList = await repo.listCardsForUser(TEST_UID_BOB);
      expect(bobList.map((c) => c.id)).toContain(bobCard.id);
    });

    it("refuses when keepId appears in mergeIds", async () => {
      const keep = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      await expect(repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, [keep.id])).rejects.toThrow(
        /keepId cannot/,
      );
    });

    it("noops on empty mergeIds", async () => {
      const keep = await repo.createCardForUser(aCard(), { uid: TEST_UID_ALICE });
      const result = await repo.mergeCardsForUser(TEST_UID_ALICE, keep.id, []);
      expect(result.merged).toBe(0);
    });
  });
});
