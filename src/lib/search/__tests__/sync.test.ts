import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { toSearchDoc } from "../sync";

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-1",
    workspaceId: "ws-1",
    ownerUid: "uid-alice",
    memberUids: ["uid-alice"],
    whyRemember: "",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("toSearchDoc", () => {
  it("copies required fields with createdAt as unix millis", () => {
    const card = makeCard({ nameZh: "陳志明", nameEn: "Alex Chen" });
    const doc = toSearchDoc(card);
    expect(doc.id).toBe("card-1");
    expect(doc.cardId).toBe("card-1");
    expect(doc.workspaceId).toBe("ws-1");
    expect(doc.createdAt).toBe(new Date("2026-04-01T00:00:00Z").getTime());
    expect(doc.nameZh).toBe("陳志明");
    expect(doc.nameEn).toBe("Alex Chen");
  });

  it("omits empty-string text fields so facet cardinality stays clean", () => {
    const card = makeCard({ nameZh: "", nameEn: "  ", companyZh: "台積電" });
    const doc = toSearchDoc(card);
    expect(doc.nameZh).toBeUndefined();
    expect(doc.nameEn).toBeUndefined();
    expect(doc.companyZh).toBe("台積電");
  });

  it("omits empty tag arrays (not [])", () => {
    const doc = toSearchDoc(makeCard());
    expect(doc.tagIds).toBeUndefined();
    expect(doc.tagNames).toBeUndefined();
  });

  it("sorts tagIds and tagNames for stable diffs", () => {
    const card = makeCard({
      tagIds: ["tag-c", "tag-a", "tag-b"],
      tagNames: ["醫療", "AI", "半導體"],
    });
    const doc = toSearchDoc(card);
    expect(doc.tagIds).toEqual(["tag-a", "tag-b", "tag-c"]);
    // String.prototype.sort uses UTF-16 code units — deterministic.
    expect(doc.tagNames).toEqual([...card.tagNames].sort());
  });

  it("sorts memberUids so workspace access checks are deterministic", () => {
    const card = makeCard({ memberUids: ["uid-c", "uid-a", "uid-b"] });
    const doc = toSearchDoc(card);
    expect(doc.memberUids).toEqual(["uid-a", "uid-b", "uid-c"]);
  });

  it("encodes lastContactedAt as unix millis when present", () => {
    const now = new Date("2026-04-15T10:00:00Z");
    const doc = toSearchDoc(makeCard({ lastContactedAt: now }));
    expect(doc.lastContactedAt).toBe(now.getTime());
  });

  it("omits lastContactedAt when null (never contacted)", () => {
    const doc = toSearchDoc(makeCard({ lastContactedAt: null }));
    expect(doc.lastContactedAt).toBeUndefined();
  });

  it("handles null createdAt by falling back to 0", () => {
    const doc = toSearchDoc(makeCard({ createdAt: null }));
    expect(doc.createdAt).toBe(0);
  });

  it("refuses to index soft-deleted cards — callers must delete-by-id instead", () => {
    const card = makeCard({ deletedAt: new Date() });
    expect(() => toSearchDoc(card)).toThrow(/soft-deleted/);
  });

  it("includes Chinese-only content fields (whyRemember, notes) unchanged for CJK tokenizer", () => {
    const card = makeCard({
      whyRemember: "在 COMPUTEX 2024 聊到邊緣 AI",
      notes: "研發部副理",
    });
    const doc = toSearchDoc(card);
    expect(doc.whyRemember).toContain("邊緣 AI");
    expect(doc.notes).toBe("研發部副理");
  });
});
