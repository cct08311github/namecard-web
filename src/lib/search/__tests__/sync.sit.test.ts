import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createCardForUser,
  listCardsForUser,
  softDeleteCardForUser,
  touchLastContactedAt,
  updateCardForUser,
} from "@/db/cards";
import { ensureCardsCollection } from "@/lib/search/bootstrap";
import { getTypesenseClient } from "@/lib/search/client";
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

/**
 * Full Firestore → Typesense round-trip via the emulator stack + a real
 * Typesense Docker instance. Asserts:
 *   - createCard upserts to the index
 *   - updateCard replaces the doc
 *   - softDelete removes the doc
 *   - touchLastContactedAt updates the ranking signal
 *   - CJK tokenizer matches 「陳」 → 「陳志明」
 *
 * CI provisions Typesense as a services.typesense container in the SIT
 * job; locally, run `pnpm search:up` before `pnpm test:sit`. The suite
 * self-skips when the server isn't reachable (so developers without
 * Docker running still get a fast test signal).
 */

const ALICE = { uid: "uid-alice-sync", email: "alice-sync@example.com" };

async function queryCards(
  query: string,
): Promise<Array<{ id: string; nameZh?: string; nameEn?: string }>> {
  const client = getTypesenseClient();
  const res = await client.collections(CARDS_COLLECTION_NAME).documents().search({
    q: query,
    query_by: "nameZh,nameEn,companyZh,companyEn,tagNames,whyRemember,notes,jobTitleZh,jobTitleEn",
    per_page: 10,
  });
  return (res.hits ?? []).map((h) => {
    const doc = h.document as { id: string; nameZh?: string; nameEn?: string };
    return doc;
  });
}

async function getDoc(id: string): Promise<unknown | null> {
  try {
    return await getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents(id).retrieve();
  } catch (err: unknown) {
    const status = (err as { httpStatus?: number })?.httpStatus;
    if (status === 404) return null;
    throw err;
  }
}

const ready = await waitForTypesense();
const suite = ready ? describe : describe.skip;

suite(`sync — Firestore → Typesense round-trip [${EMULATOR_PROJECT_ID}]`, () => {
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
  });

  it("createCardForUser upserts a search doc with the Firestore id", async () => {
    const { id } = await createCardForUser(
      aCard({
        nameZh: "陳志明",
        nameEn: "Alex Chen",
        companyZh: "台積電",
        whyRemember: "在 COMPUTEX 2024 聊到邊緣 AI",
      }),
      { uid: ALICE.uid },
    );

    const doc = (await getDoc(id)) as {
      cardId: string;
      workspaceId: string;
      nameZh?: string;
      memberUids: string[];
    } | null;
    expect(doc).not.toBeNull();
    expect(doc!.cardId).toBe(id);
    expect(doc!.nameZh).toBe("陳志明");
    expect(doc!.memberUids).toContain(ALICE.uid);
  });

  it("CJK tokenizer — 「陳」 matches 「陳志明」 (acceptance criterion)", async () => {
    await createCardForUser(aCard({ nameZh: "陳志明", nameEn: "", companyZh: "", companyEn: "" }), {
      uid: ALICE.uid,
    });

    const hits = await queryCards("陳");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.nameZh).toBe("陳志明");
  });

  it("updateCardForUser replaces the indexed doc", async () => {
    const { id } = await createCardForUser(aCard({ nameZh: "王小明" }), {
      uid: ALICE.uid,
    });

    await updateCardForUser(id, { nameZh: "王大明" }, { uid: ALICE.uid });

    const doc = (await getDoc(id)) as { nameZh?: string } | null;
    expect(doc?.nameZh).toBe("王大明");
  });

  it("softDeleteCardForUser removes the indexed doc", async () => {
    const { id } = await createCardForUser(aCard({ nameZh: "測試" }), {
      uid: ALICE.uid,
    });

    expect(await getDoc(id)).not.toBeNull();
    await softDeleteCardForUser(id, { uid: ALICE.uid });
    expect(await getDoc(id)).toBeNull();
  });

  it("touchLastContactedAt updates the ranking signal in-place", async () => {
    const { id } = await createCardForUser(aCard({ nameZh: "聯絡測試" }), {
      uid: ALICE.uid,
    });

    const before = (await getDoc(id)) as { lastContactedAt?: number } | null;
    expect(before?.lastContactedAt).toBeUndefined();

    await touchLastContactedAt(id, { uid: ALICE.uid });

    const after = (await getDoc(id)) as { lastContactedAt?: number } | null;
    expect(after?.lastContactedAt).toBeGreaterThan(0);
  });

  it("listCardsForUser still works (pure Firestore path, untouched by sync)", async () => {
    await createCardForUser(aCard({ nameZh: "甲" }), { uid: ALICE.uid });
    const cards = await listCardsForUser(ALICE.uid);
    expect(cards).toHaveLength(1);
  });
});
