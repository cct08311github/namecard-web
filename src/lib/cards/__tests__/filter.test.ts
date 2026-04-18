import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { applyTagFilter } from "../filter";

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
