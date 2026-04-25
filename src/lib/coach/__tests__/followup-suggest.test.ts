import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import { suggestNextFollowupDate } from "../followup-suggest";

const NOW = new Date(2026, 3, 25, 12, 0, 0); // 2026-04-25 12:00 local

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

function ev(at: Date, id?: string): ContactEvent {
  return {
    id: id ?? `e-${at.getTime()}`,
    at,
    note: "n",
    authorUid: "u",
    authorDisplay: null,
  };
}

function dayOffset(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("suggestNextFollowupDate", () => {
  it("falls back to default 30 days when no events", () => {
    const out = suggestNextFollowupDate(aCard(), [], NOW);
    expect(out.basedOn).toBe("default");
    expect(out.offsetDays).toBe(30);
    expect(out.isoDate).toBe("2026-05-25");
    expect(out.reasonZh).toContain("預設");
  });

  it("falls back to default with only one event (need >= 2 to compute gap)", () => {
    const out = suggestNextFollowupDate(aCard(), [ev(dayOffset(NOW, -7))], NOW);
    expect(out.basedOn).toBe("default");
    expect(out.offsetDays).toBe(30);
  });

  it("uses median gap with 2 evenly spaced events", () => {
    const events = [ev(dayOffset(NOW, -10)), ev(dayOffset(NOW, -30))];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.basedOn).toBe("rhythm");
    expect(out.offsetDays).toBe(20);
    expect(out.reasonZh).toContain("20 天");
  });

  it("uses median (not mean) for irregular gaps", () => {
    // Gaps (consecutive): 15, 15, 15, 145 days
    // Median of [15, 15, 15, 145] = (15+15)/2 = 15
    // Mean would be 47.5 — proves we picked median, not mean.
    const events = [
      ev(dayOffset(NOW, -10)),
      ev(dayOffset(NOW, -25)),
      ev(dayOffset(NOW, -40)),
      ev(dayOffset(NOW, -55)),
      ev(dayOffset(NOW, -200)),
    ];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.basedOn).toBe("rhythm");
    expect(out.offsetDays).toBe(15);
  });

  it("clamps suggestion to MIN_OFFSET_DAYS (7) when median < 7", () => {
    // Gap of 3 days → would suggest 3 → clamps to 7
    const events = [ev(dayOffset(NOW, -3)), ev(dayOffset(NOW, -6))];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.offsetDays).toBe(7);
    expect(out.reasonZh).toContain("3 天");
    expect(out.reasonZh).toContain("7 天後");
  });

  it("clamps suggestion to MAX_OFFSET_DAYS (180) when median > 180", () => {
    const events = [ev(dayOffset(NOW, -200)), ev(dayOffset(NOW, -600))];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.offsetDays).toBe(180);
  });

  it("ignores events with epoch / invalid at timestamps", () => {
    const events = [ev(new Date(0)), ev(dayOffset(NOW, -10)), ev(dayOffset(NOW, -30))];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.basedOn).toBe("rhythm");
    expect(out.offsetDays).toBe(20);
  });

  it("returns valid YYYY-MM-DD format usable in <input type=date>", () => {
    const out = suggestNextFollowupDate(aCard(), [], NOW);
    expect(out.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to default when all events collapse to zero gaps", () => {
    // Same timestamp twice → no positive gap → no rhythm
    const at = dayOffset(NOW, -10);
    const events = [ev(at, "a"), ev(at, "b")];
    const out = suggestNextFollowupDate(aCard(), events, NOW);
    expect(out.basedOn).toBe("default");
  });
});
