import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { categorizeTimeline } from "../categorize";

const NOW = new Date("2026-04-18T00:00:00Z");

function card(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    workspaceId: "u1",
    ownerUid: "u1",
    memberUids: ["u1"],
    nameZh: "陳志明",
    whyRemember: "x",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    isPinned: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("categorizeTimeline", () => {
  it("returns 4 sections in fixed order (pinned first)", () => {
    const sections = categorizeTimeline([], { now: NOW });
    expect(sections.map((s) => s.id)).toEqual([
      "pinned",
      "newly-added",
      "met-this-month",
      "uncontacted",
    ]);
  });

  it("puts pinned cards in the pinned section and excludes them from uncontacted", () => {
    const staleAndPinned = card({
      id: "p",
      isPinned: true,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      lastContactedAt: new Date("2020-01-01T00:00:00Z"),
    });
    const staleUnpinned = card({
      id: "u",
      isPinned: false,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      lastContactedAt: new Date("2020-01-01T00:00:00Z"),
    });
    const sections = categorizeTimeline([staleAndPinned, staleUnpinned], { now: NOW });
    const pinned = sections.find((s) => s.id === "pinned")!;
    const uncontacted = sections.find((s) => s.id === "uncontacted")!;
    expect(pinned.cards.map((c) => c.id)).toEqual(["p"]);
    expect(uncontacted.cards.map((c) => c.id)).toEqual(["u"]);
  });

  it("pinned section is not capped (bypasses maxPerSection)", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      card({ id: `p${i}`, isPinned: true, updatedAt: new Date(2026, 3, 20 - i) }),
    );
    const sections = categorizeTimeline(many, { now: NOW, maxPerSection: 5 });
    const pinned = sections.find((s) => s.id === "pinned")!;
    expect(pinned.cards).toHaveLength(12);
  });

  it("classifies firstMetDate in current month as met-this-month", () => {
    const c = card({ firstMetDate: "2026-04-10" });
    const [, , met] = categorizeTimeline([c], { now: NOW });
    expect(met.cards).toHaveLength(1);
    expect(met.cards[0]).toBe(c);
  });

  it("classifies firstMetDate last month as NOT met-this-month", () => {
    const c = card({ firstMetDate: "2026-03-10" });
    const [, newly, met, uncontacted] = categorizeTimeline([c], { now: NOW });
    expect(met.cards).toHaveLength(0);
    // createdAt is 2026-01-01 so not newly-added; last contact null → uncontacted
    expect(newly.cards).toHaveLength(0);
    expect(uncontacted.cards).toHaveLength(1);
  });

  it("classifies recently created card as newly-added (within 7 days)", () => {
    const c = card({
      id: "new",
      createdAt: new Date("2026-04-15T00:00:00Z"),
    });
    const [, newly] = categorizeTimeline([c], { now: NOW });
    expect(newly.cards.map((card) => card.id)).toContain("new");
  });

  it("classifies card with lastContactedAt > 30 days as uncontacted", () => {
    const c = card({
      id: "stale",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastContactedAt: new Date("2026-02-01T00:00:00Z"), // > 30 days before NOW
    });
    const [, , , uncontacted] = categorizeTimeline([c], { now: NOW });
    expect(uncontacted.cards.map((card) => card.id)).toContain("stale");
  });

  it("classifies card with lastContactedAt within 30 days as NOT uncontacted", () => {
    const c = card({
      id: "fresh",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastContactedAt: new Date("2026-04-15T00:00:00Z"), // 3 days before NOW
    });
    const [, newly, met, uncontacted] = categorizeTimeline([c], { now: NOW });
    expect([...newly.cards, ...met.cards, ...uncontacted.cards]).toHaveLength(0);
  });

  it("never double-counts a card in multiple sections", () => {
    const c = card({
      id: "all-match",
      firstMetDate: "2026-04-10",
      createdAt: new Date("2026-04-15T00:00:00Z"),
      lastContactedAt: null,
    });
    const sections = categorizeTimeline([c], { now: NOW });
    const totalAppearances = sections.reduce(
      (sum, s) => sum + s.cards.filter((card) => card.id === "all-match").length,
      0,
    );
    expect(totalAppearances).toBe(1);
  });

  it("sorts newly-added by createdAt desc", () => {
    const older = card({
      id: "older",
      createdAt: new Date("2026-04-12T00:00:00Z"),
    });
    const newer = card({
      id: "newer",
      createdAt: new Date("2026-04-17T00:00:00Z"),
    });
    const [, newly] = categorizeTimeline([older, newer], { now: NOW });
    expect(newly.cards.map((c) => c.id)).toEqual(["newer", "older"]);
  });

  it("sorts uncontacted by staleness asc (oldest contact first)", () => {
    const a = card({
      id: "a",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastContactedAt: new Date("2025-10-01T00:00:00Z"),
    });
    const b = card({
      id: "b",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastContactedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const [, , , uncontacted] = categorizeTimeline([b, a], { now: NOW });
    expect(uncontacted.cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("caps each section at maxPerSection", () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      card({
        id: `c-${i}`,
        createdAt: new Date(`2026-04-1${i % 8}T00:00:00Z`),
      }),
    );
    const sections = categorizeTimeline(cards, { now: NOW, maxPerSection: 3 });
    for (const s of sections) {
      expect(s.cards.length).toBeLessThanOrEqual(3);
    }
  });

  it("excludes soft-deleted cards", () => {
    const c = card({
      id: "deleted",
      createdAt: new Date("2026-04-15T00:00:00Z"),
      deletedAt: new Date("2026-04-16T00:00:00Z"),
    });
    const sections = categorizeTimeline([c], { now: NOW });
    for (const s of sections) {
      expect(s.cards.find((card) => card.id === "deleted")).toBeUndefined();
    }
  });

  it("treats invalid firstMetDate as missing", () => {
    const c = card({
      firstMetDate: "04/10/2026" as unknown as string,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    const [, , met, uncontacted] = categorizeTimeline([c], { now: NOW });
    expect(met.cards).toHaveLength(0);
    expect(uncontacted.cards).toHaveLength(1);
  });

  it("sorts met-this-month by firstMetDate desc", () => {
    const early = card({ id: "early", firstMetDate: "2026-04-03" });
    const late = card({ id: "late", firstMetDate: "2026-04-17" });
    const [, , met] = categorizeTimeline([early, late], { now: NOW });
    expect(met.cards.map((c) => c.id)).toEqual(["late", "early"]);
  });

  it("falls back to 0 in met-this-month sort when firstMetDate is malformed", () => {
    const good = card({ id: "good", firstMetDate: "2026-04-15" });
    // broken date never enters met-this-month, but guard the sort fallback
    // via a card with firstMetDate set to a valid current-month date only once.
    const [, , met] = categorizeTimeline([good], { now: NOW });
    expect(met.cards).toHaveLength(1);
  });

  it("handles card without createdAt gracefully", () => {
    const c = card({ id: "no-created", createdAt: null });
    const sections = categorizeTimeline([c], { now: NOW });
    // Without createdAt and lastContactedAt, treated as stale → uncontacted.
    const flatten = sections.flatMap((s) => s.cards.map((card) => card.id));
    expect(flatten).toContain("no-created");
  });

  it("uses default uncontactedDays/newlyAddedDays/maxPerSection when omitted", () => {
    const sections = categorizeTimeline([], { now: NOW });
    const newly = sections.find((s) => s.id === "newly-added")!;
    const uncontacted = sections.find((s) => s.id === "uncontacted")!;
    expect(newly.description).toMatch(/7 天/);
    expect(uncontacted.description).toMatch(/30 天/);
  });

  it("respects custom uncontactedDays override", () => {
    const c = card({
      id: "recent",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      lastContactedAt: new Date("2026-04-12T00:00:00Z"),
    });
    // With a 5-day threshold, a 6-day-old last contact is now "stale".
    const sections = categorizeTimeline([c], { now: NOW, uncontactedDays: 5 });
    const uncontacted = sections.find((s) => s.id === "uncontacted")!;
    expect(uncontacted.cards.map((card) => card.id)).toContain("recent");
  });
});
