/**
 * SIT for cards Server Actions — end-to-end through safe-action middleware,
 * zod validation, and the cards repository, against the Firestore emulator.
 *
 * TDD: assertions written BEFORE validating the implementation.
 */
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  getSitFirestore,
  isEmulatorReady,
  resetEmulators,
} from "@/test/firebase-emulator";
import { TEST_EMAIL_ALICE, TEST_UID_ALICE, aCard } from "@/test/fixtures";
import type { SessionUser } from "@/lib/firebase/session";

const describeIfEmulator = isEmulatorReady() ? describe : describe.skip;

// Session value switched per test.
let mockSessionUser: SessionUser | null = null;
vi.mock("@/lib/firebase/session", () => ({
  readSession: async () => mockSessionUser,
  createSession: async () => mockSessionUser ?? null,
  destroySession: async () => {},
}));

// revalidatePath is a Next.js runtime API; stub with a tracker so tests can
// assert the action called it with the right paths.
const revalidated: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

async function seedWorkspace(uid: string): Promise<void> {
  await getSitFirestore()
    .collection("workspaces")
    .doc(uid)
    .set({
      ownerUid: uid,
      memberUids: [uid],
      name: "Personal",
      createdAt: Timestamp.now(),
    });
}

describeIfEmulator("cards server actions (SIT)", () => {
  let actions: typeof import("../actions");

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    actions = await import("../actions");
  });

  beforeEach(async () => {
    revalidated.length = 0;
    mockSessionUser = {
      uid: TEST_UID_ALICE,
      email: TEST_EMAIL_ALICE,
      displayName: "Alice",
    };
    await resetEmulators();
    await seedWorkspace(TEST_UID_ALICE);
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  describe("createCardAction", () => {
    it("creates a card and returns its id when authenticated", async () => {
      const result = await actions.createCardAction(aCard());
      expect(result?.data?.id).toMatch(/^[A-Za-z0-9]{10,}$/);
      expect(result?.serverError).toBeUndefined();
      expect(result?.validationErrors).toBeUndefined();
    });

    it("rejects when no session user", async () => {
      mockSessionUser = null;
      const result = await actions.createCardAction(aCard());
      expect(result?.serverError).toMatch(/未授權|重新登入/);
      expect(result?.data).toBeUndefined();
    });

    it("rejects when whyRemember is empty (zod validation)", async () => {
      const result = await actions.createCardAction(
        aCard({ whyRemember: "" as unknown as string }),
      );
      expect(result?.validationErrors).toBeDefined();
      expect(result?.data).toBeUndefined();
    });

    it("rejects when name / email / phone all absent (refine rule)", async () => {
      const result = await actions.createCardAction(
        aCard({
          nameZh: "",
          nameEn: "",
          phones: [],
          emails: [],
        }),
      );
      expect(result?.validationErrors).toBeDefined();
    });

    it("revalidates / and /cards after success", async () => {
      await actions.createCardAction(aCard());
      expect(revalidated).toContain("/");
      expect(revalidated).toContain("/cards");
    });

    it("persists card with ownerUid=session.uid (session wiring)", async () => {
      const result = await actions.createCardAction(aCard());
      const id = result?.data?.id;
      const doc = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      expect(doc.data()?.ownerUid).toBe(TEST_UID_ALICE);
      expect(doc.data()?.memberUids).toEqual([TEST_UID_ALICE]);
    });
  });

  describe("updateCardAction", () => {
    it("updates whyRemember of an existing card", async () => {
      const created = await actions.createCardAction(aCard());
      const id = created?.data?.id;
      revalidated.length = 0;

      const result = await actions.updateCardAction({
        id: id!,
        input: { whyRemember: "後續聯絡過兩次" },
      });
      expect(result?.data?.ok).toBe(true);
      expect(revalidated).toContain(`/cards/${id}`);

      const doc = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      expect(doc.data()?.whyRemember).toBe("後續聯絡過兩次");
    });

    it("rejects when unauthenticated", async () => {
      mockSessionUser = null;
      const result = await actions.updateCardAction({
        id: "any",
        input: { whyRemember: "x" },
      });
      expect(result?.serverError).toMatch(/未授權|重新登入/);
    });

    it("rejects when id is empty", async () => {
      const result = await actions.updateCardAction({
        id: "",
        input: { whyRemember: "x" },
      });
      expect(result?.validationErrors).toBeDefined();
    });

    it("surfaces server error when card does not exist", async () => {
      const result = await actions.updateCardAction({
        id: "does-not-exist",
        input: { whyRemember: "x" },
      });
      expect(result?.serverError).toBeDefined();
    });
  });

  describe("deleteCardAction", () => {
    it("soft-deletes an existing card", async () => {
      const created = await actions.createCardAction(aCard());
      const id = created?.data?.id;
      expect(id).toBeTruthy();
      if (!id) return;

      const result = await actions.deleteCardAction({ id });
      expect(result?.data?.ok).toBe(true);

      const doc = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      expect(doc.data()?.deletedAt).toBeInstanceOf(Timestamp);
    });

    it("revalidates / and /cards on delete", async () => {
      const created = await actions.createCardAction(aCard());
      revalidated.length = 0;

      const did = created?.data?.id;
      expect(did).toBeTruthy();
      if (!did) return;
      await actions.deleteCardAction({ id: did });
      expect(revalidated).toContain("/");
      expect(revalidated).toContain("/cards");
    });

    it("rejects when unauthenticated", async () => {
      mockSessionUser = null;
      const result = await actions.deleteCardAction({ id: "any" });
      expect(result?.serverError).toMatch(/未授權|重新登入/);
    });
  });

  describe("touchCardAction", () => {
    it("updates lastContactedAt", async () => {
      const created = await actions.createCardAction(aCard());
      const id = created?.data?.id;
      expect(id).toBeTruthy();
      if (!id) return;

      const before = Date.now();
      await actions.touchCardAction({ id });
      const after = Date.now();

      const doc = await getSitFirestore().doc(`workspaces/${TEST_UID_ALICE}/cards/${id}`).get();
      const lastContactedAt = (doc.data()?.lastContactedAt as Timestamp).toMillis();
      expect(lastContactedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(lastContactedAt).toBeLessThanOrEqual(after + 1000);
    });

    it("rejects when unauthenticated", async () => {
      mockSessionUser = null;
      const result = await actions.touchCardAction({ id: "any" });
      expect(result?.serverError).toMatch(/未授權|重新登入/);
    });
  });
});
