import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { selectTodayPriorityCards } from "../priority";

const NOW = new Date("2026-04-25T10:00:00Z");

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
    createdAt: new Date("2025-01-01"),
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("selectTodayPriorityCards", () => {
  it("returns empty when no cards meet any priority threshold", () => {
    const fresh = mk({
      id: "fresh",
      lastContactedAt: new Date("2026-04-20"),
    });
    expect(selectTodayPriorityCards([fresh], { now: NOW })).toEqual([]);
  });

  it("flags overdue followUp with the highest score", () => {
    const overdue = mk({
      id: "overdue",
      followUpAt: new Date("2026-04-10"), // 15 days overdue
    });
    const dueToday = mk({
      id: "today",
      followUpAt: new Date("2026-04-25"),
    });
    const result = selectTodayPriorityCards([dueToday, overdue], { now: NOW });
    expect(result.map((r) => r.card.id)).toEqual(["overdue", "today"]);
    expect(result[0]!.reason).toBe("followup-overdue");
    expect(result[1]!.reason).toBe("followup-due-today");
  });

  it("scores anniversary lower than followUp but higher than uncontacted", () => {
    const followUp = mk({
      id: "fu",
      followUpAt: new Date("2026-04-25"),
    });
    const anniv = mk({
      id: "anniv",
      firstMetDate: "2025-04-25",
    });
    const stale = mk({
      id: "stale",
      lastContactedAt: new Date("2025-12-01"),
    });
    const result = selectTodayPriorityCards([anniv, followUp, stale], { now: NOW });
    expect(result.map((r) => r.card.id)).toEqual(["fu", "anniv", "stale"]);
    expect(result[1]!.reason).toBe("anniversary");
    expect(result[2]!.reason).toBe("uncontacted-long");
  });

  it("flags pinned-stale (>=21 days uncontacted) for pinned cards", () => {
    const pinnedStale = mk({
      id: "pinned",
      isPinned: true,
      lastContactedAt: new Date("2026-04-01"), // 24 days
    });
    const result = selectTodayPriorityCards([pinnedStale], { now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("pinned-stale");
  });

  it("does not include pinned cards contacted recently", () => {
    const pinnedFresh = mk({
      id: "pinFresh",
      isPinned: true,
      lastContactedAt: new Date("2026-04-20"), // 5 days
    });
    expect(selectTodayPriorityCards([pinnedFresh], { now: NOW })).toEqual([]);
  });

  it("excludes soft-deleted cards", () => {
    const deleted = mk({
      id: "del",
      followUpAt: new Date("2026-04-10"),
      deletedAt: new Date("2026-04-20"),
    });
    expect(selectTodayPriorityCards([deleted], { now: NOW })).toEqual([]);
  });

  it("caps results at max (default 5)", () => {
    const cards = Array.from({ length: 12 }, (_, i) =>
      mk({
        id: `c${i}`,
        followUpAt: new Date("2026-04-20"),
      }),
    );
    const result = selectTodayPriorityCards(cards, { now: NOW });
    expect(result).toHaveLength(5);
  });

  it("respects custom max", () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      mk({
        id: `c${i}`,
        followUpAt: new Date("2026-04-20"),
      }),
    );
    expect(selectTodayPriorityCards(cards, { now: NOW, max: 3 })).toHaveLength(3);
  });

  it("anniversary years scale the score (5y > 1y)", () => {
    const oneYear = mk({ id: "1y", firstMetDate: "2025-04-25" });
    const fiveYear = mk({ id: "5y", firstMetDate: "2021-04-25" });
    const result = selectTodayPriorityCards([oneYear, fiveYear], { now: NOW });
    expect(result.map((r) => r.card.id)).toEqual(["5y", "1y"]);
  });

  it("a card hitting multiple categories keeps its highest reason only", () => {
    const both = mk({
      id: "both",
      followUpAt: new Date("2026-04-10"), // overdue
      firstMetDate: "2025-04-25", // anniversary today too
    });
    const result = selectTodayPriorityCards([both], { now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toBe("followup-overdue");
  });

  it("daysOffset is meaningful per reason kind", () => {
    const overdue = mk({ id: "o", followUpAt: new Date("2026-04-10") });
    const dueToday = mk({ id: "d", followUpAt: new Date("2026-04-25") });
    const stale = mk({ id: "s", lastContactedAt: new Date("2025-10-01") });
    const result = selectTodayPriorityCards([overdue, dueToday, stale], { now: NOW });
    expect(result.find((r) => r.card.id === "o")!.daysOffset).toBeGreaterThan(0);
    expect(result.find((r) => r.card.id === "d")!.daysOffset).toBe(0);
    expect(result.find((r) => r.card.id === "s")!.daysOffset).toBeGreaterThan(60);
  });
});
