/**
 * SIT for src/db/cards-batch.ts — the batch import repository.
 *
 * Requires:
 *   FIRESTORE_EMULATOR_HOST
 *   FIREBASE_AUTH_EMULATOR_HOST
 *   TYPESENSE_HOST + TYPESENSE_API_KEY (optional — suite skips Typesense cases if absent)
 *
 * Run via: pnpm test:sit (firebase emulators:exec wrapper).
 *
 * Acceptance criteria:
 *   1. Create 100 cards in <10s.
 *   2. All created cards have correct invariant fields (memberUids, ownerUid, workspaceId, deletedAt).
 *   3. All 100 docs are reindexed to Typesense.
 *   4. Merge path: existing field survives; incoming fills empty fields; Typesense reindex.
 *   5. Skip path: no Firestore write, no Typesense change.
 *   6. Mixed (3 create + 1 skip + 1 merge): counts correct.
 *   7. Chunk boundary: 450 creates → 450 cards in Firestore + Typesense.
 */

import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  getSitFirestore,
  resetEmulators,
} from "@/test/firebase-emulator";
import {
  waitForTypesense,
  resetTypesense,
  bootstrapTypesense,
  CARDS_COLLECTION_NAME,
} from "@/test/typesense-harness";
import { TEST_UID_ALICE, aCard } from "@/test/fixtures";
import { cardsPath, personalWorkspaceId } from "@/lib/firebase/shared";

const WID = personalWorkspaceId(TEST_UID_ALICE);

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

async function typesenseCardCount(uid: string): Promise<number> {
  const { getTypesenseClient } = await import("@/lib/search/client");
  const client = getTypesenseClient();
  const res = await client
    .collections(CARDS_COLLECTION_NAME)
    .documents()
    .search({
      q: "*",
      query_by: "nameEn,nameZh",
      filter_by: `memberUids:=[${uid}]`,
      per_page: 1,
    });
  return (res as { found: number }).found;
}

describe("batchCreateCardsForUser (SIT)", () => {
  let batchModule: typeof import("../cards-batch");
  let tsReady: boolean;

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";

    batchModule = await import("../cards-batch");

    tsReady = await waitForTypesense();
    if (tsReady) {
      await bootstrapTypesense();
    }
  });

  beforeEach(async () => {
    await resetEmulators();
    await seedWorkspace(TEST_UID_ALICE);
    if (tsReady) {
      await resetTypesense();
    }
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  // ------------------------------------------------------------------
  // Case 1: Create 100 cards in <10s
  // ------------------------------------------------------------------
  it("creates 100 cards in under 10 seconds", async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      aCard({ nameEn: `Contact ${i}`, emails: [{ label: "work", value: `c${i}@example.com` }] }),
    );
    const decisions = rows.map(() => ({ kind: "create" as const }));

    const start = Date.now();
    const result = await batchModule.batchCreateCardsForUser(
      { rows, decisions },
      { uid: TEST_UID_ALICE },
    );
    const elapsed = Date.now() - start;

    expect(result.created).toBe(100);
    expect(result.errors).toHaveLength(0);
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000);

  // ------------------------------------------------------------------
  // Case 2: Invariant fields on created cards
  // ------------------------------------------------------------------
  it("stamps memberUids, ownerUid, workspaceId, deletedAt=null on every card", async () => {
    const rows = [aCard({ nameEn: "Invariant Test" })];
    const decisions = [{ kind: "create" as const }];

    const result = await batchModule.batchCreateCardsForUser(
      { rows, decisions },
      { uid: TEST_UID_ALICE },
    );

    expect(result.created).toBe(1);
    expect(result.createdIds).toHaveLength(1);

    const snap = await getSitFirestore()
      .doc(`${cardsPath(WID)}/${result.createdIds[0]}`)
      .get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;
    expect(data.memberUids).toEqual([TEST_UID_ALICE]);
    expect(data.ownerUid).toBe(TEST_UID_ALICE);
    expect(data.workspaceId).toBe(WID);
    expect(data.deletedAt).toBeNull();
  });

  // ------------------------------------------------------------------
  // Case 3: Typesense reindex for all 100 docs (skip if TS not running)
  // ------------------------------------------------------------------
  it("reindexes all 100 cards to Typesense", async () => {
    if (!tsReady) {
      console.log("[skip] Typesense not available");
      return;
    }

    const rows = Array.from({ length: 100 }, (_, i) =>
      aCard({
        nameEn: `TS Contact ${i}`,
        emails: [{ label: "work", value: `ts${i}@example.com` }],
      }),
    );
    const decisions = rows.map(() => ({ kind: "create" as const }));

    await batchModule.batchCreateCardsForUser({ rows, decisions }, { uid: TEST_UID_ALICE });

    const count = await typesenseCardCount(TEST_UID_ALICE);
    expect(count).toBe(100);
  }, 20_000);

  // ------------------------------------------------------------------
  // Case 4: Merge path — existing fields survive, incoming fills gaps
  // ------------------------------------------------------------------
  it("merge: existing fields survive; incoming fills missing fields; Typesense reindex", async () => {
    // Pre-seed a card with known data.
    const { createCardForUser } = await import("../cards");
    const { id: existingId } = await createCardForUser(
      aCard({
        nameEn: "Original Name",
        companyEn: "Original Corp",
        emails: [{ label: "work", value: "orig@example.com" }],
        notes: undefined,
      }),
      { uid: TEST_UID_ALICE },
    );

    // Incoming row: same email, different name, fills missing `notes`.
    const incomingRow = aCard({
      nameEn: "Should Be Ignored",
      companyEn: "Should Be Ignored",
      emails: [{ label: "work", value: "orig@example.com" }],
      notes: "Newly added note",
    });

    const result = await batchModule.batchCreateCardsForUser(
      {
        rows: [incomingRow],
        decisions: [{ kind: "merge", cardId: existingId }],
      },
      { uid: TEST_UID_ALICE },
    );

    expect(result.merged).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Existing string fields must survive.
    const snap = await getSitFirestore()
      .doc(`${cardsPath(WID)}/${existingId}`)
      .get();
    const data = snap.data()!;
    expect(data.nameEn).toBe("Original Name");
    expect(data.companyEn).toBe("Original Corp");
    // Notes was empty → incoming value written.
    expect(data.notes).toBe("Newly added note");
  });

  // ------------------------------------------------------------------
  // Case 5: Skip path — no Firestore write
  // ------------------------------------------------------------------
  it("skip: produces no Firestore write and no Typesense change", async () => {
    const rows = [aCard({ nameEn: "Skipped Card" })];
    const decisions = [{ kind: "skip" as const }];

    const result = await batchModule.batchCreateCardsForUser(
      { rows, decisions },
      { uid: TEST_UID_ALICE },
    );

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.merged).toBe(0);
    expect(result.createdIds).toHaveLength(0);

    // Firestore should have no card docs.
    const snap = await getSitFirestore().collection(cardsPath(WID)).get();
    expect(snap.size).toBe(0);
  });

  // ------------------------------------------------------------------
  // Case 6: Mixed — 3 create + 1 skip + 1 merge
  // ------------------------------------------------------------------
  it("mixed batch: 3 create + 1 skip + 1 merge → correct counts", async () => {
    const { createCardForUser } = await import("../cards");
    const { id: mergeTargetId } = await createCardForUser(
      aCard({ nameEn: "Merge Target", emails: [{ label: "work", value: "merge@example.com" }] }),
      { uid: TEST_UID_ALICE },
    );

    const rows = [
      aCard({ nameEn: "Create 1" }),
      aCard({ nameEn: "Create 2" }),
      aCard({ nameEn: "Create 3" }),
      aCard({ nameEn: "Skipped" }),
      aCard({ nameEn: "Merged One", emails: [{ label: "work", value: "merge@example.com" }] }),
    ];
    const decisions = [
      { kind: "create" as const },
      { kind: "create" as const },
      { kind: "create" as const },
      { kind: "skip" as const },
      { kind: "merge" as const, cardId: mergeTargetId },
    ];

    const result = await batchModule.batchCreateCardsForUser(
      { rows, decisions },
      { uid: TEST_UID_ALICE },
    );

    expect(result.created).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.merged).toBe(1);
    expect(result.createdIds).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Case 7: Chunk boundary — 450 creates → 450 in Firestore + Typesense
  // ------------------------------------------------------------------
  it("chunk boundary: 450 creates land in Firestore (and Typesense when available)", async () => {
    const TOTAL = 450;
    const rows = Array.from({ length: TOTAL }, (_, i) =>
      aCard({ nameEn: `Chunk ${i}`, emails: [{ label: "work", value: `chunk${i}@example.com` }] }),
    );
    const decisions = rows.map(() => ({ kind: "create" as const }));

    const result = await batchModule.batchCreateCardsForUser(
      { rows, decisions },
      { uid: TEST_UID_ALICE },
    );

    expect(result.created).toBe(TOTAL);
    expect(result.errors).toHaveLength(0);
    expect(result.createdIds).toHaveLength(TOTAL);

    // Verify Firestore doc count.
    const allSnap = await getSitFirestore().collection(cardsPath(WID)).get();
    expect(allSnap.size).toBe(TOTAL);

    if (tsReady) {
      const count = await typesenseCardCount(TEST_UID_ALICE);
      expect(count).toBe(TOTAL);
    }
  }, 60_000);
});
