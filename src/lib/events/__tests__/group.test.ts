import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { eventSlug, findEventBySlug, groupCardsByEvent } from "../group";

function mk(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    whyRemember: "x",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("eventSlug", () => {
  it("lowercases ASCII and collapses spaces to dashes", () => {
    expect(eventSlug("Web Summit Lisbon")).toBe("web-summit-lisbon");
  });

  it("preserves CJK characters", () => {
    expect(eventSlug("AppWorks Demo Day")).toBe("appworks-demo-day");
    expect(eventSlug("產業創新論壇 2024")).toBe("產業創新論壇-2024");
  });

  it("strips punctuation and collapses repeated dashes", () => {
    expect(eventSlug("R&D / 場次三")).toBe("rd-場次三");
    expect(eventSlug("--Hello--")).toBe("hello");
  });
});

describe("groupCardsByEvent", () => {
  it("clusters case/whitespace variants under one group", () => {
    const a = mk({ id: "a", firstMetEventTag: "2024 COMPUTEX" });
    const b = mk({ id: "b", firstMetEventTag: "2024 computex " });
    const c = mk({ id: "c", firstMetEventTag: "2024 Computex" });
    const groups = groupCardsByEvent([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].slug).toBe("2024-computex");
  });

  it("uses the first-seen variant as displayName", () => {
    const first = mk({ id: "first", firstMetEventTag: "2024 COMPUTEX" });
    const variant = mk({ id: "variant", firstMetEventTag: "2024 computex" });
    const groups = groupCardsByEvent([first, variant]);
    expect(groups[0].displayName).toBe("2024 COMPUTEX");
  });

  it("excludes cards with no firstMetEventTag", () => {
    const noTag = mk({ id: "noTag" });
    const withTag = mk({ id: "x", firstMetEventTag: "Web Summit" });
    const groups = groupCardsByEvent([noTag, withTag]);
    expect(groups).toHaveLength(1);
  });

  it("excludes soft-deleted cards", () => {
    const live = mk({ id: "live", firstMetEventTag: "Demo Day" });
    const gone = mk({ id: "gone", firstMetEventTag: "Demo Day", deletedAt: new Date() });
    const groups = groupCardsByEvent([live, gone]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["live"]);
  });

  it("sorts cards within group by firstMetDate desc", () => {
    const old = mk({
      id: "old",
      firstMetEventTag: "Conf",
      firstMetDate: "2025-01-01",
    });
    const fresh = mk({
      id: "fresh",
      firstMetEventTag: "Conf",
      firstMetDate: "2026-04-01",
    });
    const groups = groupCardsByEvent([old, fresh]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["fresh", "old"]);
  });

  it("sorts groups by mostRecentMet desc; tiebreak on slug", () => {
    const oldEvent = mk({
      id: "old",
      firstMetEventTag: "Old Conf",
      firstMetDate: "2025-01-01",
    });
    const freshEvent = mk({
      id: "fresh",
      firstMetEventTag: "Fresh Conf",
      firstMetDate: "2026-04-01",
    });
    const groups = groupCardsByEvent([oldEvent, freshEvent]);
    expect(groups.map((g) => g.displayName)).toEqual(["Fresh Conf", "Old Conf"]);
  });

  it("falls back to createdAt when firstMetDate missing", () => {
    const a = mk({
      id: "a",
      firstMetEventTag: "X",
      firstMetDate: undefined,
      createdAt: new Date("2026-04-15"),
    });
    const b = mk({
      id: "b",
      firstMetEventTag: "X",
      firstMetDate: undefined,
      createdAt: new Date("2026-04-10"),
    });
    const groups = groupCardsByEvent([a, b]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("findEventBySlug", () => {
  it("returns matching group case-insensitively", () => {
    const a = mk({ id: "a", firstMetEventTag: "AppWorks Demo Day" });
    const found = findEventBySlug([a], "appworks-demo-day");
    expect(found?.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns null when no group matches", () => {
    expect(findEventBySlug([], "missing")).toBeNull();
    expect(findEventBySlug([mk({ firstMetEventTag: "X" })], "y")).toBeNull();
  });
});
