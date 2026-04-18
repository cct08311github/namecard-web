import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCardForUser } from "@/db/cards";
import { ensureCardsCollection } from "@/lib/search/bootstrap";
import { getTypesenseClient } from "@/lib/search/client";
import { buildSearchParams } from "@/lib/search/query";
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
 * End-to-end search: seed cards via Firestore emulator, sync to Typesense,
 * query using the production `buildSearchParams` contract, assert
 * ranking + workspace isolation + latency acceptance criteria.
 */

const ALICE = { uid: "uid-alice-search", email: "alice-s@example.com" };
const BOB = { uid: "uid-bob-search", email: "bob-s@example.com" };

const ready = await waitForTypesense();
const suite = ready ? describe : describe.skip;

suite(`search end-to-end [${EMULATOR_PROJECT_ID}]`, () => {
  beforeAll(async () => {
    resetClientSingleton();
    await ensureCardsCollection();
  });

  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetTypesense();
    await seedEmulatorUser(ALICE);
    await seedEmulatorUser(BOB);
    await ensurePersonalWorkspace({ uid: ALICE.uid });
    await ensurePersonalWorkspace({ uid: BOB.uid });
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  async function search(params: ReturnType<typeof buildSearchParams>) {
    return getTypesenseClient().collections(CARDS_COLLECTION_NAME).documents().search(params);
  }

  it("acceptance: 中文「陳」命中「陳志明」", async () => {
    await createCardForUser(aCard({ nameZh: "陳志明" }), { uid: ALICE.uid });
    const res = await search(buildSearchParams({ q: "陳", memberUid: ALICE.uid }));
    expect(res.found).toBeGreaterThan(0);
    expect((res.hits?.[0]?.document as { nameZh?: string })?.nameZh).toBe("陳志明");
  });

  it("acceptance: mixed zh/en search hits both", async () => {
    await createCardForUser(aCard({ nameZh: "王小明", nameEn: "Alex Wang" }), {
      uid: ALICE.uid,
    });
    const zh = await search(buildSearchParams({ q: "王", memberUid: ALICE.uid }));
    const en = await search(buildSearchParams({ q: "Alex", memberUid: ALICE.uid }));
    expect(zh.found).toBeGreaterThan(0);
    expect(en.found).toBeGreaterThan(0);
  });

  it("workspace isolation — bob cannot see alice's cards even with identical query", async () => {
    await createCardForUser(aCard({ nameZh: "alice-only", companyZh: "" }), {
      uid: ALICE.uid,
    });
    const aliceRes = await search(buildSearchParams({ q: "alice-only", memberUid: ALICE.uid }));
    const bobRes = await search(buildSearchParams({ q: "alice-only", memberUid: BOB.uid }));
    expect(aliceRes.found).toBe(1);
    expect(bobRes.found).toBe(0);
  });

  it("ranking — sort_by puts recently-contacted cards first for equal text matches", async () => {
    await createCardForUser(aCard({ nameZh: "舊聯絡", companyZh: "ACME" }), {
      uid: ALICE.uid,
    });
    await createCardForUser(aCard({ nameZh: "新聯絡", companyZh: "ACME" }), {
      uid: ALICE.uid,
    });
    // Touch-last-contact the second card so it ranks first.
    const { touchLastContactedAt, listCardsForUser } = await import("@/db/cards");
    const cards = await listCardsForUser(ALICE.uid);
    const fresh = cards.find((c) => c.nameZh === "新聯絡")!;
    await touchLastContactedAt(fresh.id, { uid: ALICE.uid });

    const res = await search(buildSearchParams({ q: "ACME", memberUid: ALICE.uid }));
    expect((res.hits?.[0]?.document as { nameZh?: string })?.nameZh).toBe("新聯絡");
  });

  it("latency — 20-card workspace search < 200ms (server-side budget)", async () => {
    for (let i = 0; i < 20; i++) {
      await createCardForUser(
        aCard({ nameZh: `甲${i}`, companyZh: "測試公司", whyRemember: "latency test" }),
        { uid: ALICE.uid },
      );
    }
    const started = Date.now();
    const res = await search(buildSearchParams({ q: "測試", memberUid: ALICE.uid }));
    const elapsed = Date.now() - started;
    expect(res.found).toBe(20);
    expect(elapsed).toBeLessThan(200);
  });
});
