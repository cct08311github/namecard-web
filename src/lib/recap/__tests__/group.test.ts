import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import { groupRecapByDay, type RecapItem } from "../group";

function aCard(over: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-x",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
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

function anEvent(at: Date, note = "n", id = "e"): ContactEvent {
  return { id, at, note, authorUid: "u", authorDisplay: null };
}

function mkItem(card: CardSummary, at: Date, note = "n"): RecapItem {
  return { card, event: anEvent(at, note) };
}

describe("groupRecapByDay", () => {
  // Use an explicit local-time anchor (00:00) so the day arithmetic doesn't
  // straddle UTC boundaries and the labels stay deterministic regardless of
  // the runner's TZ.
  const NOW = new Date(2026, 3, 25, 12, 0, 0); // 2026-04-25 12:00 local

  it("returns [] for empty input", () => {
    expect(groupRecapByDay([], NOW)).toEqual([]);
  });

  it("labels today and yesterday correctly", () => {
    const today = new Date(2026, 3, 25, 9, 0);
    const yesterday = new Date(2026, 3, 24, 9, 0);
    const groups = groupRecapByDay(
      [mkItem(aCard({ id: "a" }), today), mkItem(aCard({ id: "b" }), yesterday)],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe("今天");
    expect(groups[1]!.label).toBe("昨天");
  });

  it("labels within last week as 本週X", () => {
    const fourDaysAgo = new Date(2026, 3, 21, 9, 0); // Tuesday
    const groups = groupRecapByDay([mkItem(aCard({ id: "a" }), fourDaysAgo)], NOW);
    expect(groups[0]!.label).toMatch(/^本週/);
  });

  it("labels week+ ago as 上週X", () => {
    const tenDaysAgo = new Date(2026, 3, 15, 9, 0);
    const groups = groupRecapByDay([mkItem(aCard({ id: "a" }), tenDaysAgo)], NOW);
    expect(groups[0]!.label).toMatch(/^上週/);
  });

  it("labels older as M 月 D 日", () => {
    const old = new Date(2026, 0, 15, 9, 0);
    const groups = groupRecapByDay([mkItem(aCard({ id: "a" }), old)], NOW);
    expect(groups[0]!.label).toBe("1 月 15 日");
  });

  it("groups multiple items on the same day into one bucket", () => {
    const at = new Date(2026, 3, 25, 9, 0);
    const groups = groupRecapByDay(
      [mkItem(aCard({ id: "a" }), at, "first"), mkItem(aCard({ id: "b" }), at, "second")],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("orders buckets newest-day-first", () => {
    const yesterday = new Date(2026, 3, 24, 9, 0);
    const today = new Date(2026, 3, 25, 9, 0);
    const groups = groupRecapByDay(
      [mkItem(aCard({ id: "old" }), yesterday), mkItem(aCard({ id: "new" }), today)],
      NOW,
    );
    expect(groups[0]!.label).toBe("今天");
    expect(groups[1]!.label).toBe("昨天");
  });

  it("preserves caller's intra-day ordering", () => {
    const at = new Date(2026, 3, 25, 9, 0);
    const groups = groupRecapByDay(
      [mkItem(aCard({ id: "first" }), at, "1"), mkItem(aCard({ id: "second" }), at, "2")],
      NOW,
    );
    expect(groups[0]!.items.map((i) => i.event.note)).toEqual(["1", "2"]);
  });

  it("drops items with epoch / invalid event.at", () => {
    const groups = groupRecapByDay(
      [
        mkItem(aCard({ id: "good" }), new Date(2026, 3, 25, 9, 0)),
        mkItem(aCard({ id: "bad" }), new Date(0)),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(1);
    expect(groups[0]!.items[0]!.card.id).toBe("good");
  });
});
