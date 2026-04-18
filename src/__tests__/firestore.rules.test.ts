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

  describe("workspace membership", () => {
    // Use w6-scoped uids to avoid collision with the cards suite above.
    const ALICE = "uid-alice-w6";
    const BOB = "uid-bob-w6";
    const CAROL = "uid-carol-w6";

    function makeW6Workspace(overrides: Record<string, unknown> = {}) {
      return {
        ownerUid: ALICE,
        name: "Alice W6",
        memberUids: [ALICE],
        createdAt: new Date(),
        ...overrides,
      };
    }

    function makeW6Card(overrides: Record<string, unknown> = {}) {
      return {
        ownerUid: ALICE,
        workspaceId: ALICE,
        memberUids: [ALICE],
        nameZh: "測試聯絡人",
        whyRemember: "P6C 測試用途",
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

    it("alice can read her own cards (baseline)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", ALICE), makeW6Workspace());
        await setDoc(doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-1"), makeW6Card());
      });
      const alice = testEnv.authenticatedContext(ALICE).firestore();
      await assertSucceeds(getDoc(doc(alice, "workspaces", ALICE, "cards", "card-w6-1")));
    });

    it("bob can read alice's card when bob is in memberUids", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE),
          makeW6Workspace({ memberUids: [ALICE, BOB] }),
        );
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-2"),
          makeW6Card({ memberUids: [ALICE, BOB] }),
        );
      });
      const bob = testEnv.authenticatedContext(BOB).firestore();
      await assertSucceeds(getDoc(doc(bob, "workspaces", ALICE, "cards", "card-w6-2")));
    });

    it("bob CANNOT read alice's card when bob is NOT in memberUids", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "workspaces", ALICE), makeW6Workspace());
        await setDoc(doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-3"), makeW6Card());
      });
      const bob = testEnv.authenticatedContext(BOB).firestore();
      await assertFails(getDoc(doc(bob, "workspaces", ALICE, "cards", "card-w6-3")));
    });

    it("bob loses read access after being removed from memberUids", async () => {
      // Seed card with bob included.
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE),
          makeW6Workspace({ memberUids: [ALICE, BOB] }),
        );
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-4"),
          makeW6Card({ memberUids: [ALICE, BOB] }),
        );
      });

      // Simulate removal: update card to drop bob from memberUids.
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-4"),
          makeW6Card({ memberUids: [ALICE] }),
        );
      });

      const bob = testEnv.authenticatedContext(BOB).firestore();
      await assertFails(getDoc(doc(bob, "workspaces", ALICE, "cards", "card-w6-4")));
    });

    it("only owner can update the workspace doc", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE),
          makeW6Workspace({ memberUids: [ALICE, BOB] }),
        );
      });

      // Alice (owner) may update.
      const alice = testEnv.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        updateDoc(doc(alice, "workspaces", ALICE), {
          name: "Alice's Workspace (updated)",
        }),
      );

      // Bob (editor) may NOT update.
      const bob = testEnv.authenticatedContext(BOB).firestore();
      await assertFails(
        updateDoc(doc(bob, "workspaces", ALICE), {
          name: "Bob tries to rename",
        }),
      );
    });

    it("card write: alice OK, bob OK when member, carol denied when non-member", async () => {
      // Set up workspace with alice and bob as members.
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE),
          makeW6Workspace({ memberUids: [ALICE, BOB] }),
        );
        // Seed an existing card for the update test.
        await setDoc(
          doc(ctx.firestore(), "workspaces", ALICE, "cards", "card-w6-5"),
          makeW6Card({ memberUids: [ALICE, BOB] }),
        );
      });

      // Alice creates a new card — OK.
      const alice = testEnv.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        setDoc(
          doc(alice, "workspaces", ALICE, "cards", "card-w6-6"),
          makeW6Card({ memberUids: [ALICE, BOB] }),
        ),
      );

      // Bob (editor, in memberUids) updates the existing card — OK.
      const bob = testEnv.authenticatedContext(BOB).firestore();
      await assertSucceeds(
        updateDoc(doc(bob, "workspaces", ALICE, "cards", "card-w6-5"), {
          nameZh: "Bob 更新了",
          updatedAt: new Date(),
        }),
      );

      // Carol (non-member) write denied.
      const carol = testEnv.authenticatedContext(CAROL).firestore();
      await assertFails(
        setDoc(
          doc(carol, "workspaces", ALICE, "cards", "card-w6-7"),
          makeW6Card({ ownerUid: CAROL, memberUids: [CAROL] }),
        ),
      );
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
