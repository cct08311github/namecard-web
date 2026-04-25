import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import type { RecapItem } from "../group";
import { filterRecapItems } from "../search";

function aCard(over: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-x",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    whyRemember: "x",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...over,
  } as CardSummary;
}

function mkItem(card: CardSummary, note: string): RecapItem {
  const event: ContactEvent = {
    id: `e-${Math.random()}`,
    at: new Date(),
    note,
    authorUid: "u",
    authorDisplay: null,
  };
  return { card, event };
}

describe("filterRecapItems", () => {
  const items: RecapItem[] = [
    mkItem(
      aCard({ id: "a", nameZh: "陳玉涵", companyZh: "智威科技" }),
      "她公司在募 A 輪、看 SaaS 估值",
    ),
    mkItem(
      aCard({ id: "b", nameZh: "李大同", nameEn: "Tom Lee", companyEn: "GreenLeaf" }),
      "demo day pitch deck 第 5 頁",
    ),
    mkItem(
      aCard({ id: "c", nameZh: "王小明", jobTitleZh: "CTO", companyZh: "Pixel" }),
      "OEM 合約細節討論",
    ),
  ];

  it("returns full list when query is empty", () => {
    expect(filterRecapItems(items, "")).toHaveLength(3);
    expect(filterRecapItems(items, "   ")).toHaveLength(3);
  });

  it("filters by event note (substring)", () => {
    const result = filterRecapItems(items, "SaaS");
    expect(result.map((i) => i.card.id)).toEqual(["a"]);
  });

  it("is case-insensitive on English fields", () => {
    expect(filterRecapItems(items, "saas").map((i) => i.card.id)).toEqual(["a"]);
    expect(filterRecapItems(items, "SAAS").map((i) => i.card.id)).toEqual(["a"]);
  });

  it("matches by Chinese name", () => {
    const result = filterRecapItems(items, "陳玉涵");
    expect(result.map((i) => i.card.id)).toEqual(["a"]);
  });

  it("matches by English name", () => {
    const result = filterRecapItems(items, "Tom");
    expect(result.map((i) => i.card.id)).toEqual(["b"]);
  });

  it("matches by company (zh)", () => {
    const result = filterRecapItems(items, "智威");
    expect(result.map((i) => i.card.id)).toEqual(["a"]);
  });

  it("matches by company (en)", () => {
    const result = filterRecapItems(items, "greenleaf");
    expect(result.map((i) => i.card.id)).toEqual(["b"]);
  });

  it("matches by job title", () => {
    const result = filterRecapItems(items, "CTO");
    expect(result.map((i) => i.card.id)).toEqual(["c"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterRecapItems(items, "完全不存在的關鍵字")).toEqual([]);
  });

  it("returns multiple items when query matches multiple", () => {
    // "公司" matches "智威科技" no, but matches event notes mentioning "公司"
    const items2: RecapItem[] = [
      mkItem(aCard({ id: "x" }), "公司 A"),
      mkItem(aCard({ id: "y" }), "公司 B"),
      mkItem(aCard({ id: "z" }), "個人事務"),
    ];
    expect(filterRecapItems(items2, "公司").map((i) => i.card.id)).toEqual(["x", "y"]);
  });

  it("preserves caller's input order", () => {
    expect(filterRecapItems(items, "").map((i) => i.card.id)).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace in query", () => {
    expect(filterRecapItems(items, "  SaaS  ").map((i) => i.card.id)).toEqual(["a"]);
  });

  it("doesn't crash when card fields are undefined", () => {
    const sparse: RecapItem[] = [
      mkItem(aCard({ id: "sparse", nameZh: undefined, nameEn: undefined }), "X"),
    ];
    expect(filterRecapItems(sparse, "X").map((i) => i.card.id)).toEqual(["sparse"]);
  });
});
