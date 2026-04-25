import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { applyTagFilter, countByTemperature, filterByTemperature } from "../filter";

function card(id: string, tagIds: string[]): CardSummary {
  return {
    id,
    workspaceId: "ws",
    ownerUid: "u",
    memberUids: ["u"],
    whyRemember: "",
    phones: [],
    emails: [],
    tagIds,
    tagNames: [],
    social: {},
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
  };
}

function tempCard(id: string, daysAgoLastContact: number | null, isPinned = false): CardSummary {
  const now = new Date(2026, 3, 26, 12, 0, 0);
  const lastContactedAt =
    daysAgoLastContact === null
      ? null
      : new Date(now.getTime() - daysAgoLastContact * 24 * 60 * 60 * 1000);
  return {
    ...card(id, []),
    isPinned,
    lastContactedAt,
  };
}

describe("applyTagFilter", () => {
  const cards = [
    card("a", ["ai", "biz"]),
    card("b", ["ai"]),
    card("c", ["biz"]),
    card("d", []),
    card("e", ["ai", "biz", "client"]),
  ];

  it("no tags — pass-through (returns all cards)", () => {
    expect(applyTagFilter(cards, [], "or").length).toBe(cards.length);
    expect(applyTagFilter(cards, [], "and").length).toBe(cards.length);
  });

  it("OR — keeps cards with at least one wanted tag", () => {
    const result = applyTagFilter(cards, ["ai"], "or");
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b", "e"]);
  });

  it("OR with multiple tags — union semantics", () => {
    const result = applyTagFilter(cards, ["ai", "client"], "or");
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b", "e"]);
  });

  it("AND — requires every wanted tag to be present", () => {
    const result = applyTagFilter(cards, ["ai", "biz"], "and");
    expect(result.map((c) => c.id).sort()).toEqual(["a", "e"]);
  });

  it("AND — single tag behaves like OR", () => {
    expect(
      applyTagFilter(cards, ["ai"], "and")
        .map((c) => c.id)
        .sort(),
    ).toEqual(
      applyTagFilter(cards, ["ai"], "or")
        .map((c) => c.id)
        .sort(),
    );
  });

  it("AND — tag not present anywhere returns empty", () => {
    expect(applyTagFilter(cards, ["nonexistent"], "and")).toHaveLength(0);
  });

  it("returns a new array (does not mutate input)", () => {
    const result = applyTagFilter(cards, [], "or");
    expect(result).not.toBe(cards);
  });

  it("handles >10 tags in OR mode (Typesense substitute path)", () => {
    const manyTags = Array.from({ length: 15 }, (_, i) => `tag-${i}`);
    const cardsWithManyTags = [card("x", ["tag-0", "tag-5", "tag-14"]), card("y", ["tag-99"])];
    const result = applyTagFilter(cardsWithManyTags, manyTags, "or");
    expect(result.map((c) => c.id)).toEqual(["x"]);
  });
});

describe("filterByTemperature", () => {
  const NOW = new Date(2026, 3, 26, 12, 0, 0);
  const cards = [
    tempCard("hot", 3), // 3 days
    tempCard("warm", 20), // 20 days
    tempCard("active", 60), // 60 days
    tempCard("quiet", 120), // 120 days
    tempCard("cold", 365), // 1 year
    tempCard("never", null),
  ];

  it("empty levels → pass-through (returns all cards)", () => {
    expect(filterByTemperature(cards, [], NOW)).toHaveLength(cards.length);
  });

  it("single level filters to just matching cards", () => {
    expect(filterByTemperature(cards, ["hot"], NOW).map((c) => c.id)).toEqual(["hot"]);
    expect(
      filterByTemperature(cards, ["cold"], NOW)
        .map((c) => c.id)
        .sort(),
    ).toEqual(["cold", "never"]);
  });

  it("multiple levels OR together", () => {
    const result = filterByTemperature(cards, ["quiet", "cold"], NOW);
    expect(result.map((c) => c.id).sort()).toEqual(["cold", "never", "quiet"]);
  });

  it("returns [] when no cards match", () => {
    const onlyCold = [tempCard("a", 365), tempCard("b", 400)];
    expect(filterByTemperature(onlyCold, ["hot"], NOW)).toEqual([]);
  });

  it("returns a new array (does not mutate input)", () => {
    const result = filterByTemperature(cards, [], NOW);
    expect(result).not.toBe(cards);
  });
});

describe("countByTemperature", () => {
  const NOW = new Date(2026, 3, 26, 12, 0, 0);

  it("counts cards across all 5 levels", () => {
    const cards = [
      tempCard("a", 3),
      tempCard("b", 20),
      tempCard("c", 60),
      tempCard("d", 120),
      tempCard("e", 365),
      tempCard("f", null),
    ];
    expect(countByTemperature(cards, NOW)).toEqual({
      hot: 1,
      warm: 1,
      active: 1,
      quiet: 1,
      cold: 2,
    });
  });

  it("returns zeros for empty list", () => {
    expect(countByTemperature([], NOW)).toEqual({
      hot: 0,
      warm: 0,
      active: 0,
      quiet: 0,
      cold: 0,
    });
  });

  it("respects pinned floor (pinned long-quiet is warm not quiet)", () => {
    const cards = [tempCard("p", 200, true)];
    expect(countByTemperature(cards, NOW).warm).toBe(1);
    expect(countByTemperature(cards, NOW).quiet).toBe(0);
  });
});
