import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createCardForUser, getCardForUser } from "@/db/cards";
import { ensureCardsCollection } from "@/lib/search/bootstrap";
import { getTypesenseClient } from "@/lib/search/client";
import { enqueueSyncFailure, reconcileFailures } from "@/lib/search/reconcile";
import { CARDS_COLLECTION_NAME } from "@/lib/search/schema";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";
import {
  clearFirestoreEmulator,
  disposeSitApp,
  EMULATOR_PROJECT_ID,
  seedEmulatorUser,
} from "@/test/firebase-emulator";
import { aCard } from "@/test/fixtures";
import { resetClientSingleton, resetTypesense, waitForTypesense } from "@/test/typesense-harness";
import { getAdminFirestore } from "@/lib/firebase/server";
import { personalWorkspaceId } from "@/lib/firebase/shared";

const ALICE = { uid: "uid-alice-reconcile", email: "alice-r@example.com" };

async function docExistsInTypesense(id: string): Promise<boolean> {
  try {
    await getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents(id).retrieve();
    return true;
  } catch (err: unknown) {
    if ((err as { httpStatus?: number })?.httpStatus === 404) return false;
    throw err;
  }
}

const ready = await waitForTypesense();
const suite = ready ? describe : describe.skip;

suite(`reconcile queue [${EMULATOR_PROJECT_ID}]`, () => {
  beforeAll(async () => {
    resetClientSingleton();
    await ensureCardsCollection();
  });

  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetTypesense();
    await seedEmulatorUser(ALICE);
    await ensurePersonalWorkspace({ uid: ALICE.uid });
  });

  afterAll(async () => {
    await disposeSitApp();
    vi.restoreAllMocks();
  });

  it("enqueueSyncFailure writes to searchSyncFailures path", async () => {
    const wid = personalWorkspaceId(ALICE.uid);
    await enqueueSyncFailure(wid, "card-fake", "upsert", new Error("boom"));

    const db = getAdminFirestore();
    const snap = await db.collection(`workspaces/${wid}/searchSyncFailures`).get();
    expect(snap.size).toBe(1);
    const record = snap.docs[0]?.data();
    expect(record?.cardId).toBe("card-fake");
    expect(record?.op).toBe("upsert");
    expect(record?.error).toContain("boom");
    expect(record?.attempts).toBe(0);
  });

  it("reconcileFailures replays an upsert and clears the queue entry on success", async () => {
    // Seed a real card, then manually enqueue a failure for it (as if the
    // initial upsert had failed). Reconcile should index it and clear the queue.
    const { id } = await createCardForUser(aCard({ nameZh: "補償測試" }), {
      uid: ALICE.uid,
    });
    // Delete it from Typesense so the queue entry has actual work to do.
    await getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents(id).delete();
    expect(await docExistsInTypesense(id)).toBe(false);

    const wid = personalWorkspaceId(ALICE.uid);
    await enqueueSyncFailure(wid, id, "upsert", new Error("simulated outage"));

    const result = await reconcileFailures(ALICE.uid, (cardId) =>
      getCardForUser(ALICE.uid, cardId),
    );
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.stillFailing).toBe(0);
    expect(await docExistsInTypesense(id)).toBe(true);

    const db = getAdminFirestore();
    const snap = await db.collection(`workspaces/${wid}/searchSyncFailures`).get();
    expect(snap.size).toBe(0);
  });

  it("reconcile resolves queue entries whose card was hard-deleted", async () => {
    const wid = personalWorkspaceId(ALICE.uid);
    await enqueueSyncFailure(wid, "missing-card-id", "upsert", new Error("x"));

    const result = await reconcileFailures(ALICE.uid, (cardId) =>
      getCardForUser(ALICE.uid, cardId),
    );
    expect(result.succeeded).toBe(1);
    expect(result.stillFailing).toBe(0);
  });
});
