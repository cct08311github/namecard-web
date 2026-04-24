import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { bucketFollowups, totalFollowups } from "../followups";

const NOW = new Date("2026-04-24T00:00:00Z");

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
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("bucketFollowups — basic bucketing", () => {
  it("puts 30-59 days into due", () => {
    const c = mk({ id: "a", lastContactedAt: daysAgo(45) });
    const g = bucketFollowups([c], NOW);
    expect(g.due.cards).toHaveLength(1);
    expect(g.overdue.cards).toHaveLength(0);
    expect(g.critical.cards).toHaveLength(0);
  });

  it("puts 60-89 days into overdue", () => {
    const c = mk({ id: "a", lastContactedAt: daysAgo(75) });
    const g = bucketFollowups([c], NOW);
    expect(g.overdue.cards).toHaveLength(1);
  });

  it("puts 90+ days into critical", () => {
    const c = mk({ id: "a", lastContactedAt: daysAgo(200) });
    const g = bucketFollowups([c], NOW);
    expect(g.critical.cards).toHaveLength(1);
  });

  it("ignores cards with <30 days (fresh)", () => {
    const c = mk({ id: "a", lastContactedAt: daysAgo(10) });
    expect(totalFollowups(bucketFollowups([c], NOW))).toBe(0);
  });
});

describe("bucketFollowups — pinned handling", () => {
  it("puts pinned + ≥30 days into pinnedStale regardless of bucket", () => {
    const a = mk({ id: "a", isPinned: true, lastContactedAt: daysAgo(45) });
    const b = mk({ id: "b", isPinned: true, lastContactedAt: daysAgo(95) });
    const g = bucketFollowups([a, b], NOW);
    expect(g.pinnedStale.cards.map((c) => c.card.id)).toEqual(["b", "a"]); // most overdue first
    expect(g.due.cards).toHaveLength(0);
    expect(g.critical.cards).toHaveLength(0);
  });

  it("ignores pinned cards that are fresh (<30 days)", () => {
    const c = mk({ id: "a", isPinned: true, lastContactedAt: daysAgo(10) });
    expect(bucketFollowups([c], NOW).pinnedStale.cards).toHaveLength(0);
  });
});

describe("bucketFollowups — data hygiene", () => {
  it("skips soft-deleted cards", () => {
    const c = mk({ id: "a", lastContactedAt: daysAgo(100), deletedAt: daysAgo(5) });
    expect(totalFollowups(bucketFollowups([c], NOW))).toBe(0);
  });

  it("skips cards with no time signal (no createdAt, no lastContactedAt)", () => {
    const c = mk({ id: "a" });
    expect(totalFollowups(bucketFollowups([c], NOW))).toBe(0);
  });

  it("falls back to createdAt when lastContactedAt is null", () => {
    const c = mk({ id: "a", createdAt: daysAgo(95) });
    expect(bucketFollowups([c], NOW).critical.cards).toHaveLength(1);
  });
});

describe("bucketFollowups — sorting", () => {
  it("most overdue first within each bucket, stable by id", () => {
    const a = mk({ id: "a", lastContactedAt: daysAgo(35) });
    const b = mk({ id: "b", lastContactedAt: daysAgo(50) });
    const c = mk({ id: "c", lastContactedAt: daysAgo(35) });
    const g = bucketFollowups([a, b, c], NOW);
    expect(g.due.cards.map((x) => x.card.id)).toEqual(["b", "a", "c"]);
  });
});

describe("totalFollowups", () => {
  it("sums across all four buckets", () => {
    const cards = [
      mk({ id: "1", lastContactedAt: daysAgo(35) }),
      mk({ id: "2", lastContactedAt: daysAgo(75) }),
      mk({ id: "3", lastContactedAt: daysAgo(120) }),
      mk({ id: "4", isPinned: true, lastContactedAt: daysAgo(40) }),
    ];
    expect(totalFollowups(bucketFollowups(cards, NOW))).toBe(4);
  });

  it("is 0 for an empty or all-fresh corpus", () => {
    expect(totalFollowups(bucketFollowups([], NOW))).toBe(0);
  });
});
