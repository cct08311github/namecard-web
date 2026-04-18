import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCardForUser, getCardForUser } from "@/db/cards";
import {
  createTagForUser,
  deleteTagForUser,
  listTagsForUser,
  recolorTagForUser,
  renameTagForUser,
} from "@/db/tags";
import { getAdminFirestore } from "@/lib/firebase/server";
import { personalWorkspaceId, tagsPath } from "@/lib/firebase/shared";
import { TAG_PALETTE } from "@/lib/tags/palette";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";
import {
  clearFirestoreEmulator,
  disposeSitApp,
  EMULATOR_PROJECT_ID,
  seedEmulatorUser,
} from "@/test/firebase-emulator";
import { aCard } from "@/test/fixtures";

const ALICE = { uid: "uid-alice-tags", email: "alice-tags@example.com" };

describe(`tags repository [${EMULATOR_PROJECT_ID}]`, () => {
  beforeAll(async () => {
    // Firebase emulator env is required; Typesense sync is allowed to
    // fail silently here (gated by syncWithFallback's config check).
  });

  beforeEach(async () => {
    await clearFirestoreEmulator();
    await seedEmulatorUser(ALICE);
    await ensurePersonalWorkspace({ uid: ALICE.uid });
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  it("createTagForUser persists a tag with normalized color", async () => {
    const { id } = await createTagForUser(ALICE.uid, {
      name: "AI",
      color: TAG_PALETTE[0]!.oklch,
    });
    const tags = await listTagsForUser(ALICE.uid);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ id, name: "AI", color: TAG_PALETTE[0]!.oklch });
  });

  it("createTagForUser is idempotent on duplicate name", async () => {
    const a = await createTagForUser(ALICE.uid, { name: "AI" });
    const b = await createTagForUser(ALICE.uid, { name: "AI" });
    expect(b.id).toBe(a.id);
    const tags = await listTagsForUser(ALICE.uid);
    expect(tags).toHaveLength(1);
  });

  it("createTagForUser snaps unknown colors to default palette", async () => {
    const { id } = await createTagForUser(ALICE.uid, {
      name: "X",
      color: "#ff0000",
    });
    const db = getAdminFirestore();
    const wid = personalWorkspaceId(ALICE.uid);
    const doc = await db.doc(`${tagsPath(wid)}/${id}`).get();
    expect(doc.data()?.color).toMatch(/^oklch\(/);
  });

  it("recolorTagForUser updates color only (does not touch name)", async () => {
    const { id } = await createTagForUser(ALICE.uid, {
      name: "客戶",
      color: TAG_PALETTE[0]!.oklch,
    });
    await recolorTagForUser(ALICE.uid, id, TAG_PALETTE[3]!.oklch);
    const tags = await listTagsForUser(ALICE.uid);
    expect(tags[0]?.color).toBe(TAG_PALETTE[3]!.oklch);
    expect(tags[0]?.name).toBe("客戶");
  });

  it("renameTagForUser propagates new name to all cards carrying the tagId", async () => {
    const tag = await createTagForUser(ALICE.uid, { name: "舊名字" });
    const card1 = await createCardForUser(
      aCard({ nameZh: "甲", tagIds: [tag.id], tagNames: ["舊名字"] }),
      { uid: ALICE.uid },
    );
    const card2 = await createCardForUser(
      aCard({ nameZh: "乙", tagIds: [tag.id], tagNames: ["舊名字"] }),
      { uid: ALICE.uid },
    );

    const result = await renameTagForUser(ALICE.uid, tag.id, "新名字");
    expect(result.cardsUpdated).toBe(2);

    const after1 = await getCardForUser(ALICE.uid, card1.id);
    const after2 = await getCardForUser(ALICE.uid, card2.id);
    expect(after1?.tagNames).toEqual(["新名字"]);
    expect(after2?.tagNames).toEqual(["新名字"]);
  });

  it("renameTagForUser is a no-op when the new name matches the current name", async () => {
    const tag = await createTagForUser(ALICE.uid, { name: "同名" });
    const result = await renameTagForUser(ALICE.uid, tag.id, "同名");
    expect(result.cardsUpdated).toBe(0);
  });

  it("renameTagForUser throws when the tag doesn't exist", async () => {
    await expect(renameTagForUser(ALICE.uid, "missing-id", "x")).rejects.toThrow(/標籤不存在/);
  });

  it("deleteTagForUser scrubs tagIds + tagNames from all referencing cards", async () => {
    const tag = await createTagForUser(ALICE.uid, { name: "待刪" });
    const card = await createCardForUser(
      aCard({ nameZh: "甲", tagIds: [tag.id], tagNames: ["待刪"] }),
      { uid: ALICE.uid },
    );

    const result = await deleteTagForUser(ALICE.uid, tag.id);
    expect(result.cardsScrubbed).toBe(1);

    const after = await getCardForUser(ALICE.uid, card.id);
    expect(after?.tagIds).toEqual([]);
    expect(after?.tagNames).toEqual([]);

    const tags = await listTagsForUser(ALICE.uid);
    expect(tags).toHaveLength(0);
  });

  it("deleteTagForUser on missing tag is a no-op", async () => {
    const result = await deleteTagForUser(ALICE.uid, "never-existed");
    expect(result.cardsScrubbed).toBe(0);
  });

  it("listTagsForUser returns tags ordered by name", async () => {
    await createTagForUser(ALICE.uid, { name: "Zeta" });
    await createTagForUser(ALICE.uid, { name: "Alpha" });
    await createTagForUser(ALICE.uid, { name: "Mu" });

    const tags = await listTagsForUser(ALICE.uid);
    expect(tags.map((t) => t.name)).toEqual(["Alpha", "Mu", "Zeta"]);
  });
});
