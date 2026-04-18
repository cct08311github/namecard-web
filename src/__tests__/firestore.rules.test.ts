/**
 * Firestore Rules integration tests — require Firebase emulator running.
 *
 * Run via:
 *   pnpm test:rules
 * (`firebase emulators:exec --only firestore "vitest run rules"`)
 *
 * CI only: guarded by RULES_EMULATOR_HOST env to avoid false-negatives when the
 * emulator isn't up.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const emulatorReady = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeIfEmulator = emulatorReady ? describe : describe.skip;

const PROJECT_ID = "namecard-web-rules-test";
const UID_ALICE = "alice-uid";
const UID_BOB = "bob-uid";

function makeCardDoc(overrides: Record<string, unknown> = {}) {
  return {
    ownerUid: UID_ALICE,
    workspaceId: UID_ALICE,
    memberUids: [UID_ALICE],
    nameZh: "陳志明",
    whyRemember: "2024 COMPUTEX 攤位聊 edge AI。",
    phones: [],
    emails: [],
    addresses: [],
    social: {},
    tagIds: [],
    tagNames: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeWorkspaceDoc(overrides: Record<string, unknown> = {}) {
  return {
    ownerUid: UID_ALICE,
    name: "Personal",
    memberUids: [UID_ALICE],
    createdAt: new Date(),
    ...overrides,
  };
}

describeIfEmulator("firestore.rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8"),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe("workspaces", () => {
    it("alice can create her personal workspace with ownerUid=alice", async () => {
      const ctx = testEnv.authenticatedContext(UID_ALICE).firestore();
      await assertSucceeds(setDoc(doc(ctx, "workspaces", UID_ALICE), makeWorkspaceDoc()));
    });

    it("alice cannot create a workspace with someone else as owner", async () => {
      const ctx = testEnv.authenticatedContext(UID_ALICE).firestore();
      await assertFails(
        setDoc(
          doc(ctx, "workspaces", UID_ALICE),
          makeWorkspaceDoc({ ownerUid: UID_BOB, memberUids: [UID_BOB] }),
        ),
      );
    });

    it("unauthenticated user cannot read workspace", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", UID_ALICE), makeWorkspaceDoc());
      });
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, "workspaces", UID_ALICE)));
    });

    it("bob cannot read alice's workspace", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", UID_ALICE), makeWorkspaceDoc());
      });
      const bob = testEnv.authenticatedContext(UID_BOB).firestore();
      await assertFails(getDoc(doc(bob, "workspaces", UID_ALICE)));
    });
  });

  describe("cards", () => {
    beforeEach(async () => {
      // Seed alice's workspace.
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", UID_ALICE), makeWorkspaceDoc());
      });
    });

    it("alice can create a card in her workspace", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await assertSucceeds(
        setDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), makeCardDoc()),
      );
    });

    it("bob cannot create a card in alice's workspace", async () => {
      const bob = testEnv.authenticatedContext(UID_BOB).firestore();
      await assertFails(
        setDoc(
          doc(bob, "workspaces", UID_ALICE, "cards", "card1"),
          makeCardDoc({ ownerUid: UID_BOB, memberUids: [UID_BOB] }),
        ),
      );
    });

    it("rejects a card without whyRemember", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      const { whyRemember: _unused, ...rest } = makeCardDoc();
      void _unused;
      await assertFails(setDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), rest));
    });

    it("rejects whyRemember exceeding 500 chars", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await assertFails(
        setDoc(
          doc(alice, "workspaces", UID_ALICE, "cards", "card1"),
          makeCardDoc({ whyRemember: "a".repeat(501) }),
        ),
      );
    });

    it("prevents ownerUid tampering on update", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await setDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), makeCardDoc());
      await assertFails(
        updateDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), {
          ownerUid: UID_BOB,
          updatedAt: new Date(),
        }),
      );
    });

    it("prevents memberUids tampering on update", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await setDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), makeCardDoc());
      await assertFails(
        updateDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), {
          memberUids: [UID_ALICE, UID_BOB],
          updatedAt: new Date(),
        }),
      );
    });

    it("bob cannot read alice's card", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", UID_ALICE, "cards", "card1"),
          makeCardDoc(),
        );
      });
      const bob = testEnv.authenticatedContext(UID_BOB).firestore();
      await assertFails(getDoc(doc(bob, "workspaces", UID_ALICE, "cards", "card1")));
    });

    it("alice can delete her own card", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await setDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1"), makeCardDoc());
      await assertSucceeds(deleteDoc(doc(alice, "workspaces", UID_ALICE, "cards", "card1")));
    });
  });

  describe("tags", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", UID_ALICE), makeWorkspaceDoc());
      });
    });

    it("alice can create a tag", async () => {
      const alice = testEnv.authenticatedContext(UID_ALICE).firestore();
      await assertSucceeds(
        setDoc(doc(alice, "workspaces", UID_ALICE, "tags", "tag1"), {
          name: "AI",
          createdAt: new Date(),
        }),
      );
    });

    it("bob cannot read alice's tags", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", UID_ALICE, "tags", "tag1"), {
          name: "AI",
          createdAt: new Date(),
        });
      });
      const bob = testEnv.authenticatedContext(UID_BOB).firestore();
      await assertFails(getDoc(doc(bob, "workspaces", UID_ALICE, "tags", "tag1")));
    });
  });
});
