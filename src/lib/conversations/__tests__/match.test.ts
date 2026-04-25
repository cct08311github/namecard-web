import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { matchPersonName } from "../match";

function aSummary(over: Partial<CardSummary>): CardSummary {
  return {
    id: over.id ?? "card-x",
    workspaceId: "wid",
    ownerUid: "uid",
    memberUids: ["uid"],
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

describe("matchPersonName", () => {
  it("returns [] for empty needle", () => {
    expect(matchPersonName("", [aSummary({ id: "a", nameZh: "陳玉涵" })])).toEqual([]);
    expect(matchPersonName("   ", [aSummary({ id: "a", nameZh: "陳玉涵" })])).toEqual([]);
  });

  it("returns [] when no cards have any name", () => {
    expect(matchPersonName("陳", [aSummary({ id: "a" })])).toEqual([]);
  });

  it("exact CJK match wins over prefix", () => {
    const cards = [
      aSummary({ id: "pre", nameZh: "陳玉涵雯" }),
      aSummary({ id: "exact", nameZh: "陳玉涵" }),
    ];
    const result = matchPersonName("陳玉涵", cards);
    expect(result.map((c) => c.id)).toEqual(["exact", "pre"]);
  });

  it("exact English match (case-insensitive)", () => {
    const cards = [
      aSummary({ id: "a", nameEn: "Bob" }),
      aSummary({ id: "b", nameEn: "Karen Chen" }),
    ];
    expect(matchPersonName("karen chen", cards).map((c) => c.id)).toEqual(["b"]);
    expect(matchPersonName("KAREN CHEN", cards).map((c) => c.id)).toEqual(["b"]);
  });

  it("prefix beats substring", () => {
    const cards = [
      aSummary({ id: "sub", nameZh: "李大同" }),
      aSummary({ id: "pre", nameZh: "李志強" }),
    ];
    expect(matchPersonName("李", cards).map((c) => c.id)).toEqual(["sub", "pre"]);
  });

  it("returns multiple substring matches in DB order", () => {
    const cards = [
      aSummary({ id: "first", nameZh: "陳志明" }),
      aSummary({ id: "second", nameZh: "陳玉涵" }),
      aSummary({ id: "third", nameZh: "王小明" }),
    ];
    expect(matchPersonName("陳", cards).map((c) => c.id)).toEqual(["first", "second"]);
  });

  it("matches across nameZh, nameEn, namePhonetic and uses best tier", () => {
    const cards = [
      aSummary({ id: "phon", namePhonetic: "Wang Xiaoming", nameZh: "王小明" }),
      aSummary({ id: "en", nameEn: "Karen Chen" }),
    ];
    expect(matchPersonName("Karen Chen", cards).map((c) => c.id)).toEqual(["en"]);
  });

  it("trims whitespace in needle", () => {
    const cards = [aSummary({ id: "a", nameZh: "陳玉涵" })];
    expect(matchPersonName("  陳玉涵  ", cards).map((c) => c.id)).toEqual(["a"]);
  });

  it("returns [] when no card matches", () => {
    const cards = [aSummary({ id: "a", nameZh: "陳玉涵" })];
    expect(matchPersonName("Karen", cards)).toEqual([]);
  });

  it("ignores blank name fields (whitespace only)", () => {
    const cards = [aSummary({ id: "blank", nameZh: "   ", nameEn: "" })];
    expect(matchPersonName("陳", cards)).toEqual([]);
  });
});
