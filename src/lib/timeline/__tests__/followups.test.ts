import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import {
  bucketFollowups,
  countFollowupsInCards,
  dueRemindersToday,
  totalFollowups,
  upcomingRemindersThisWeek,
} from "../followups";

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

describe("dueRemindersToday", () => {
  it("includes a card with followUpAt today", () => {
    const todayMidnight = new Date(NOW);
    todayMidnight.setHours(0, 0, 0, 0);
    const c = mk({ id: "a", followUpAt: todayMidnight });
    const out = dueRemindersToday([c], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].card.id).toBe("a");
  });

  it("includes a card with followUpAt in the past", () => {
    const lastWeek = daysAgo(7);
    const c = mk({ id: "p", followUpAt: lastWeek });
    expect(dueRemindersToday([c], NOW)).toHaveLength(1);
  });

  it("excludes a card with followUpAt in the future", () => {
    const tomorrow = new Date(NOW.getTime() + 36 * 60 * 60 * 1000);
    const c = mk({ id: "f", followUpAt: tomorrow });
    expect(dueRemindersToday([c], NOW)).toHaveLength(0);
  });

  it("excludes a card with no followUpAt", () => {
    const c = mk({ id: "n", lastContactedAt: daysAgo(45) });
    expect(dueRemindersToday([c], NOW)).toHaveLength(0);
  });

  it("excludes soft-deleted cards", () => {
    const c = mk({ id: "d", followUpAt: daysAgo(2), deletedAt: daysAgo(1) });
    expect(dueRemindersToday([c], NOW)).toHaveLength(0);
  });

  it("orders most-overdue reminder first; id tiebreak is deterministic", () => {
    const a = mk({ id: "a", followUpAt: daysAgo(1) });
    const b = mk({ id: "b", followUpAt: daysAgo(5) });
    const c = mk({ id: "c", followUpAt: daysAgo(1) });
    const out = dueRemindersToday([a, b, c], NOW);
    expect(out.map((x) => x.card.id)).toEqual(["b", "a", "c"]);
  });
});

describe("upcomingRemindersThisWeek", () => {
  function daysAhead(n: number): Date {
    return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
  }

  it("includes a card with followUpAt 3 days out", () => {
    const c = mk({ id: "a", followUpAt: daysAhead(3) });
    expect(upcomingRemindersThisWeek([c], NOW)).toHaveLength(1);
  });

  it("excludes today (already in dueRemindersToday)", () => {
    const todayMidnight = new Date(NOW);
    todayMidnight.setHours(12, 0, 0, 0);
    const c = mk({ id: "t", followUpAt: todayMidnight });
    expect(upcomingRemindersThisWeek([c], NOW)).toHaveLength(0);
  });

  it("includes the boundary day (exactly +7 days)", () => {
    const c = mk({ id: "b", followUpAt: daysAhead(7) });
    expect(upcomingRemindersThisWeek([c], NOW)).toHaveLength(1);
  });

  it("excludes 8+ days out (outside the week window)", () => {
    const c = mk({ id: "x", followUpAt: daysAhead(8) });
    expect(upcomingRemindersThisWeek([c], NOW)).toHaveLength(0);
  });

  it("excludes soft-deleted cards", () => {
    const c = mk({ id: "d", followUpAt: daysAhead(3), deletedAt: daysAgo(1) });
    expect(upcomingRemindersThisWeek([c], NOW)).toHaveLength(0);
  });

  it("orders soonest first; id tiebreak deterministic", () => {
    const a = mk({ id: "a", followUpAt: daysAhead(5) });
    const b = mk({ id: "b", followUpAt: daysAhead(2) });
    const c = mk({ id: "c", followUpAt: daysAhead(2) });
    const out = upcomingRemindersThisWeek([a, b, c], NOW);
    expect(out.map((x) => x.card.id)).toEqual(["b", "c", "a"]);
  });

  it("respects custom windowDays", () => {
    const c = mk({ id: "f", followUpAt: daysAhead(20) });
    expect(upcomingRemindersThisWeek([c], NOW, 30)).toHaveLength(1);
    expect(upcomingRemindersThisWeek([c], NOW, 7)).toHaveLength(0);
  });
});

describe("countFollowupsInCards", () => {
  it("sums staleness buckets and todays scheduled reminders", () => {
    const todayMid = new Date(NOW);
    todayMid.setHours(12, 0, 0, 0);
    const cards = [
      mk({ id: "stale", lastContactedAt: daysAgo(45) }), // due bucket
      mk({ id: "older", lastContactedAt: daysAgo(95) }), // critical bucket
      mk({ id: "rem-today", followUpAt: todayMid }), // due today
    ];
    expect(countFollowupsInCards(cards, NOW)).toBe(3);
  });

  it("returns 0 for an empty corpus", () => {
    expect(countFollowupsInCards([], NOW)).toBe(0);
  });

  it("ignores soft-deleted cards", () => {
    const c = mk({ id: "d", lastContactedAt: daysAgo(100), deletedAt: daysAgo(1) });
    expect(countFollowupsInCards([c], NOW)).toBe(0);
  });
});
