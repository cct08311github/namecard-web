import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";
import type { RecapItem } from "@/lib/recap/group";

import { aggregateStats } from "../aggregate";

const NOW = new Date(2026, 3, 26, 12, 0, 0);

function aCard(over: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-x",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "X",
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

function dayOffset(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

function evItem(cardId: string, daysAgo: number, name = cardId): RecapItem {
  const event: ContactEvent = {
    id: `e-${cardId}-${daysAgo}`,
    at: dayOffset(NOW, daysAgo),
    note: "n",
    authorUid: "u",
    authorDisplay: null,
  };
  return {
    card: aCard({ id: cardId, nameZh: name, lastContactedAt: dayOffset(NOW, daysAgo) }),
    event,
  };
}

function evItemWithCompany(cardId: string, daysAgo: number, companyName: string): RecapItem {
  const event: ContactEvent = {
    id: `e-${cardId}-${daysAgo}`,
    at: dayOffset(NOW, daysAgo),
    note: "n",
    authorUid: "u",
    authorDisplay: null,
  };
  return {
    card: aCard({ id: cardId, nameZh: cardId, companyZh: companyName }),
    event,
  };
}

describe("aggregateStats", () => {
  it("empty cards + empty events → zeros across the board", () => {
    const out = aggregateStats([], [], NOW);
    expect(out.thisWeek).toEqual({ logCount: 0, newCardCount: 0, distinctPeople: 0 });
    expect(out.thisMonth).toEqual({ logCount: 0, newCardCount: 0, distinctPeople: 0 });
    expect(out.streak).toEqual({ current: 0, longest: 0 });
    expect(out.topPeople).toEqual([]);
    expect(out.topCompanies).toEqual([]);
    expect(out.topEvents).toEqual([]);
    expect(out.totalCards).toBe(0);
  });

  it("counts logs in this week vs this month windows correctly", () => {
    const events = [
      evItem("a", 1),
      evItem("a", 2),
      evItem("b", 5),
      evItem("c", 10), // outside week, inside month
      evItem("d", 60), // outside both
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.thisWeek.logCount).toBe(3);
    expect(out.thisMonth.logCount).toBe(4);
    expect(out.thisWeek.distinctPeople).toBe(2); // a, b
    expect(out.thisMonth.distinctPeople).toBe(3); // a, b, c
  });

  it("counts new cards by createdAt cutoff", () => {
    const cards = [
      aCard({ id: "x", createdAt: dayOffset(NOW, 2) }),
      aCard({ id: "y", createdAt: dayOffset(NOW, 14) }),
      aCard({ id: "z", createdAt: dayOffset(NOW, 60) }),
    ];
    const out = aggregateStats(cards, [], NOW);
    expect(out.thisWeek.newCardCount).toBe(1);
    expect(out.thisMonth.newCardCount).toBe(2);
  });

  it("computes temperature distribution over live cards only", () => {
    const cards = [
      aCard({ id: "hot", lastContactedAt: dayOffset(NOW, 3) }),
      aCard({ id: "cold", lastContactedAt: dayOffset(NOW, 365) }),
      aCard({ id: "deleted", deletedAt: NOW, lastContactedAt: dayOffset(NOW, 1) }),
    ];
    const out = aggregateStats(cards, [], NOW);
    expect(out.temperature.hot).toBe(1);
    expect(out.temperature.cold).toBe(1);
    expect(out.totalCards).toBe(2); // deleted excluded
  });

  it("streak.current counts back-to-back days from today", () => {
    const events = [evItem("a", 0), evItem("b", 1), evItem("c", 2)];
    const out = aggregateStats([], events, NOW);
    expect(out.streak.current).toBe(3);
    expect(out.streak.longest).toBeGreaterThanOrEqual(3);
  });

  it("streak.current = 0 when neither today nor yesterday has logs", () => {
    const events = [evItem("a", 5)];
    const out = aggregateStats([], events, NOW);
    expect(out.streak.current).toBe(0);
  });

  it("streak.current still active if yesterday is logged but today isn't", () => {
    const events = [evItem("a", 1), evItem("b", 2)];
    const out = aggregateStats([], events, NOW);
    expect(out.streak.current).toBe(2);
  });

  it("streak.longest finds the largest consecutive run in the window", () => {
    const events = [
      evItem("a", 0),
      evItem("b", 1),
      evItem("c", 2),
      // gap of 3 days
      evItem("d", 7),
      evItem("e", 8),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.streak.longest).toBe(3);
  });

  it("topPeople sorts by log count desc then by recency", () => {
    const events = [
      evItem("a", 1),
      evItem("a", 2),
      evItem("a", 3),
      evItem("b", 1),
      evItem("b", 2),
      evItem("c", 1),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topPeople.map((p) => p.card.id)).toEqual(["a", "b", "c"]);
    expect(out.topPeople[0]!.logCount).toBe(3);
  });

  it("topPeople caps at 3", () => {
    const events = ["a", "b", "c", "d", "e"].map((id) => evItem(id, 1));
    const out = aggregateStats([], events, NOW);
    expect(out.topPeople).toHaveLength(3);
  });

  it("topPeople excludes events outside the 30-day window", () => {
    const events = [evItem("recent", 1), evItem("old", 60), evItem("old", 90)];
    const out = aggregateStats([], events, NOW);
    expect(out.topPeople.map((p) => p.card.id)).toEqual(["recent"]);
  });

  it("excludes deleted cards from temperature totals", () => {
    const cards = [
      aCard({ id: "live", lastContactedAt: dayOffset(NOW, 1) }),
      aCard({ id: "deleted", deletedAt: NOW, lastContactedAt: dayOffset(NOW, 1) }),
    ];
    const out = aggregateStats(cards, [], NOW);
    expect(out.temperature.hot).toBe(1);
  });

  it("ignores events with epoch / invalid at", () => {
    const epochEvent: RecapItem = {
      card: aCard({ id: "bad" }),
      event: {
        id: "epoch",
        at: new Date(0),
        note: "x",
        authorUid: "u",
        authorDisplay: null,
      },
    };
    const out = aggregateStats([], [epochEvent], NOW);
    expect(out.thisWeek.logCount).toBe(0);
    expect(out.streak).toEqual({ current: 0, longest: 0 });
  });
});

describe("aggregateStats — topCompanies", () => {
  it("aggregates by company name with logCount + distinctPeople", () => {
    const events = [
      evItemWithCompany("a", 1, "Acme"),
      evItemWithCompany("a", 2, "Acme"), // same person twice
      evItemWithCompany("b", 3, "Acme"), // different person same company
      evItemWithCompany("c", 5, "Beta"),
      evItemWithCompany("d", 7, "Beta"),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topCompanies).toEqual([
      { companyName: "Acme", logCount: 3, distinctPeople: 2 },
      { companyName: "Beta", logCount: 2, distinctPeople: 2 },
    ]);
  });

  it("excludes events whose card has no company", () => {
    const events = [
      evItem("nocompany", 1), // no company on card
      evItemWithCompany("withcompany", 2, "Acme"),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topCompanies.map((c) => c.companyName)).toEqual(["Acme"]);
  });

  it("excludes events outside the 30-day window", () => {
    const events = [
      evItemWithCompany("recent", 5, "Acme"),
      evItemWithCompany("old", 60, "Acme"), // outside window
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topCompanies[0]).toEqual({ companyName: "Acme", logCount: 1, distinctPeople: 1 });
  });

  it("caps at 3 companies and sorts by logCount desc", () => {
    const events = [
      evItemWithCompany("a", 1, "C1"),
      evItemWithCompany("a", 2, "C1"),
      evItemWithCompany("a", 3, "C1"),
      evItemWithCompany("a", 1, "C2"),
      evItemWithCompany("a", 2, "C2"),
      evItemWithCompany("a", 1, "C3"),
      evItemWithCompany("a", 1, "C4"), // tied with C3, but C4 sorts after by name tiebreak so C3 wins
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topCompanies).toHaveLength(3);
    expect(out.topCompanies.map((c) => c.companyName)).toEqual(["C1", "C2", "C3"]);
  });
});

function evItemWithEvent(cardId: string, daysAgo: number, eventTag: string): RecapItem {
  const event: ContactEvent = {
    id: `e-${cardId}-${daysAgo}`,
    at: dayOffset(NOW, daysAgo),
    note: "n",
    authorUid: "u",
    authorDisplay: null,
  };
  return {
    card: aCard({ id: cardId, nameZh: cardId, firstMetEventTag: eventTag }),
    event,
  };
}

describe("aggregateStats — topEvents", () => {
  it("aggregates by firstMetEventTag with logCount + distinctPeople", () => {
    const events = [
      evItemWithEvent("a", 1, "CES 2024"),
      evItemWithEvent("a", 2, "CES 2024"),
      evItemWithEvent("b", 3, "CES 2024"),
      evItemWithEvent("c", 5, "GitHub Universe"),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topEvents).toEqual([
      { eventTag: "CES 2024", logCount: 3, distinctPeople: 2 },
      { eventTag: "GitHub Universe", logCount: 1, distinctPeople: 1 },
    ]);
  });

  it("excludes events whose card has no firstMetEventTag", () => {
    const events = [evItem("noevent", 1), evItemWithEvent("withevent", 2, "CES 2024")];
    const out = aggregateStats([], events, NOW);
    expect(out.topEvents.map((e) => e.eventTag)).toEqual(["CES 2024"]);
  });

  it("excludes events outside the 30-day window", () => {
    const events = [
      evItemWithEvent("recent", 5, "CES 2024"),
      evItemWithEvent("old", 60, "CES 2024"),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topEvents[0]).toEqual({ eventTag: "CES 2024", logCount: 1, distinctPeople: 1 });
  });

  it("caps at 3 events", () => {
    const events = [
      evItemWithEvent("a", 1, "C1"),
      evItemWithEvent("a", 1, "C2"),
      evItemWithEvent("a", 1, "C3"),
      evItemWithEvent("a", 1, "C4"),
    ];
    const out = aggregateStats([], events, NOW);
    expect(out.topEvents).toHaveLength(3);
  });
});
