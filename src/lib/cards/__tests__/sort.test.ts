import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { parseSortKey, sortCards } from "../sort";

function mk(overrides: Partial<CardSummary>): CardSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    whyRemember: "",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("parseSortKey", () => {
  it("defaults to newest for unknown / missing", () => {
    expect(parseSortKey(undefined)).toBe("newest");
    expect(parseSortKey("garbage")).toBe("newest");
    expect(parseSortKey(42)).toBe("newest");
  });

  it("passes known keys through", () => {
    for (const k of ["newest", "oldest", "contacted", "name", "tempHot", "tempCold"] as const) {
      expect(parseSortKey(k)).toBe(k);
    }
  });
});

describe("sortCards: temperature sorts", () => {
  function dayOffset(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  // Build cards spanning all 5 tiers via lastContactedAt:
  //   3d → hot, 20d → warm, 60d → active, 120d → quiet, 365d → cold, null → cold
  const hot = mk({ id: "h", lastContactedAt: dayOffset(3) });
  const warm = mk({ id: "w", lastContactedAt: dayOffset(20) });
  const active = mk({ id: "a", lastContactedAt: dayOffset(60) });
  const quiet = mk({ id: "q", lastContactedAt: dayOffset(120) });
  const cold = mk({ id: "c", lastContactedAt: dayOffset(365) });
  const never = mk({ id: "n" });

  it("tempHot orders hot → cold", () => {
    const out = sortCards([cold, never, active, hot, warm, quiet], "tempHot").map((c) => c.id);
    expect(out.slice(0, 4)).toEqual(["h", "w", "a", "q"]);
    expect(out.slice(4).sort()).toEqual(["c", "n"]);
  });

  it("tempCold orders cold → hot", () => {
    const out = sortCards([cold, never, active, hot, warm, quiet], "tempCold").map((c) => c.id);
    // cold tier first (cold + never both rank 0); then quiet, active, warm, hot
    expect(out.slice(2)).toEqual(["q", "a", "w", "h"]);
  });

  it("within the same tier, recency wins as tiebreaker", () => {
    const recent = mk({ id: "recent", lastContactedAt: dayOffset(2) });
    const older = mk({ id: "older", lastContactedAt: dayOffset(5) });
    const out = sortCards([older, recent], "tempHot").map((c) => c.id);
    expect(out).toEqual(["recent", "older"]);
  });

  it("pinned card with stale contact still ranks as warm (not quiet/cold)", () => {
    const pinnedStale = mk({ id: "pin", lastContactedAt: dayOffset(200), isPinned: true });
    const unpinnedActive = mk({ id: "act", lastContactedAt: dayOffset(60) });
    // tempHot: pinned-stale (warm=3) > active (rank 2)
    const out = sortCards([unpinnedActive, pinnedStale], "tempHot").map((c) => c.id);
    expect(out).toEqual(["pin", "act"]);
  });

  it("returns a new array (doesn't mutate)", () => {
    const input = [hot, cold];
    const out = sortCards(input, "tempHot");
    expect(out).not.toBe(input);
  });
});

describe("sortCards", () => {
  it("newest: createdAt desc with nulls at the bottom", () => {
    const a = mk({ id: "a", createdAt: new Date("2026-04-01") });
    const b = mk({ id: "b", createdAt: new Date("2026-04-10") });
    const c = mk({ id: "c", createdAt: null });
    const out = sortCards([a, b, c], "newest").map((x) => x.id);
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("oldest: createdAt asc with nulls at the bottom", () => {
    const a = mk({ id: "a", createdAt: new Date("2026-04-01") });
    const b = mk({ id: "b", createdAt: new Date("2026-04-10") });
    const c = mk({ id: "c", createdAt: null });
    const out = sortCards([b, a, c], "oldest").map((x) => x.id);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("contacted: lastContactedAt desc with nulls last", () => {
    const a = mk({ id: "a", lastContactedAt: new Date("2026-04-10") });
    const b = mk({ id: "b", lastContactedAt: new Date("2026-04-20") });
    const c = mk({ id: "c", lastContactedAt: null });
    const out = sortCards([a, c, b], "contacted").map((x) => x.id);
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("name: localeCompare zh-Hant orders CJK by default collation, Latin after", () => {
    const chen = mk({ id: "1", nameZh: "陳玉涵" });
    const wang = mk({ id: "2", nameZh: "王小明" });
    const alice = mk({ id: "3", nameEn: "Alice" });
    const out = sortCards([chen, wang, alice], "name").map((x) => x.id);
    // zh-Hant collator (Node's ICU default): 王 → 陳 → Alice.
    // Test just asserts stable determinism + the known relative order.
    expect(out).toEqual(["2", "1", "3"]);
  });

  it("name: cards with no name sink to the bottom", () => {
    const named = mk({ id: "1", nameZh: "甲" });
    const blank = mk({ id: "2" });
    const out = sortCards([blank, named], "name").map((x) => x.id);
    expect(out).toEqual(["1", "2"]);
  });

  it("returns a new array (doesn't mutate)", () => {
    const input = [mk({ id: "a", createdAt: new Date("2026-01-01") })];
    const out = sortCards(input, "newest");
    expect(out).not.toBe(input);
  });

  it("tiebreaker by id keeps order stable across calls", () => {
    const shared = new Date("2026-04-15");
    const cards = ["c", "a", "b"].map((id) => mk({ id, createdAt: shared }));
    expect(sortCards(cards, "newest").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
