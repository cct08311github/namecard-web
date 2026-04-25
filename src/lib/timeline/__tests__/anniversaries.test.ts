import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { findAnniversariesToday } from "../anniversaries";

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

const NOW = new Date("2026-04-25T10:00:00");

describe("findAnniversariesToday", () => {
  it("returns cards whose firstMetDate matches today's month + day in a prior year", () => {
    const lastYear = mk({ id: "1y", firstMetDate: "2025-04-25" });
    const fiveYears = mk({ id: "5y", firstMetDate: "2021-04-25" });
    const otherDay = mk({ id: "other", firstMetDate: "2025-04-24" });
    const sameYear = mk({ id: "same", firstMetDate: "2026-04-25" });
    const result = findAnniversariesToday([lastYear, fiveYears, otherDay, sameYear], NOW);
    expect(result.map((r) => r.card.id)).toEqual(["5y", "1y"]);
    expect(result.map((r) => r.years)).toEqual([5, 1]);
  });

  it("excludes soft-deleted cards", () => {
    const live = mk({ id: "live", firstMetDate: "2025-04-25" });
    const gone = mk({ id: "gone", firstMetDate: "2025-04-25", deletedAt: new Date() });
    expect(findAnniversariesToday([live, gone], NOW).map((r) => r.card.id)).toEqual(["live"]);
  });

  it("excludes cards with no firstMetDate", () => {
    const c = mk({ id: "noDate" });
    expect(findAnniversariesToday([c], NOW)).toEqual([]);
  });

  it("excludes malformed firstMetDate strings", () => {
    const c = mk({ id: "bad", firstMetDate: "04/25/2025" as unknown as string });
    expect(findAnniversariesToday([c], NOW)).toEqual([]);
  });

  it("sorts by years desc (older milestones first), tiebreak on name asc", () => {
    const a = mk({ id: "a", nameZh: "張三", firstMetDate: "2024-04-25" });
    const b = mk({ id: "b", nameZh: "李四", firstMetDate: "2024-04-25" });
    const oldest = mk({ id: "oldest", nameZh: "王五", firstMetDate: "2020-04-25" });
    const result = findAnniversariesToday([a, b, oldest], NOW);
    expect(result.map((r) => r.card.id)).toEqual(["oldest", "b", "a"]);
  });

  it("returns empty array on a day with no anniversaries", () => {
    const c = mk({ id: "c", firstMetDate: "2025-01-01" });
    expect(findAnniversariesToday([c], NOW)).toEqual([]);
  });

  it("returns empty when no cards at all", () => {
    expect(findAnniversariesToday([], NOW)).toEqual([]);
  });

  it("Feb 29 anniversary surfaces on Feb 28 in non-leap years (closest analog)", () => {
    const leapBaby = mk({ id: "leap", firstMetDate: "2020-02-29" });
    // 2027 is not a leap year — Feb 28 2027 should surface the Feb 29 2020 card.
    const feb28NonLeap = new Date("2027-02-28T10:00:00");
    const result = findAnniversariesToday([leapBaby], feb28NonLeap);
    expect(result.map((r) => r.card.id)).toEqual(["leap"]);
    expect(result[0].years).toBe(7);
  });

  it("does NOT surface Feb 29 anniversary on Feb 28 of leap years (the actual day exists)", () => {
    const leapBaby = mk({ id: "leap", firstMetDate: "2020-02-29" });
    // 2028 is a leap year — Feb 29 will be the actual anniversary.
    const feb28Leap = new Date("2028-02-28T10:00:00");
    expect(findAnniversariesToday([leapBaby], feb28Leap)).toEqual([]);
  });
});
