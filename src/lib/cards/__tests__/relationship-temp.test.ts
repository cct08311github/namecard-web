import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { computeTemperature } from "../relationship-temp";

const NOW = new Date(2026, 3, 25, 12, 0, 0);

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
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("computeTemperature", () => {
  it("hot: contacted within last 7 days", () => {
    const card = aCard({ lastContactedAt: dayOffset(NOW, -3) });
    const t = computeTemperature(card, NOW);
    expect(t.level).toBe("hot");
    expect(t.emoji).toBe("🔥");
    expect(t.daysSince).toBe(3);
  });

  it("warm: 8-30 days", () => {
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -8) }), NOW).level).toBe(
      "warm",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -30) }), NOW).level).toBe(
      "warm",
    );
  });

  it("active: 31-90 days", () => {
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -31) }), NOW).level).toBe(
      "active",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -90) }), NOW).level).toBe(
      "active",
    );
  });

  it("quiet: 91-180 days", () => {
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -91) }), NOW).level).toBe(
      "quiet",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -180) }), NOW).level).toBe(
      "quiet",
    );
  });

  it("cold: > 180 days", () => {
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -181) }), NOW).level).toBe(
      "cold",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -1000) }), NOW).level).toBe(
      "cold",
    );
  });

  it("falls back to createdAt when lastContactedAt is null", () => {
    const card = aCard({ createdAt: dayOffset(NOW, -5) });
    expect(computeTemperature(card, NOW).level).toBe("hot");
  });

  it("never-contacted + never-created → cold (no daysSince)", () => {
    const t = computeTemperature(aCard(), NOW);
    expect(t.level).toBe("cold");
    expect(t.daysSince).toBeNull();
  });

  it("pinned overrides quiet/cold to warm", () => {
    const quietPinned = aCard({ isPinned: true, lastContactedAt: dayOffset(NOW, -150) });
    expect(computeTemperature(quietPinned, NOW).level).toBe("warm");

    const coldPinned = aCard({ isPinned: true, lastContactedAt: dayOffset(NOW, -1000) });
    expect(computeTemperature(coldPinned, NOW).level).toBe("warm");
  });

  it("pinned with no signals → warm", () => {
    const t = computeTemperature(aCard({ isPinned: true }), NOW);
    expect(t.level).toBe("warm");
    expect(t.daysSince).toBeNull();
  });

  it("pinned still keeps hot/active/warm tiers (doesn't downgrade)", () => {
    const hotPinned = aCard({ isPinned: true, lastContactedAt: dayOffset(NOW, -2) });
    expect(computeTemperature(hotPinned, NOW).level).toBe("hot");

    const activePinned = aCard({ isPinned: true, lastContactedAt: dayOffset(NOW, -60) });
    expect(computeTemperature(activePinned, NOW).level).toBe("active");
  });

  it("future lastContactedAt clamps days to 0 (no negative-days nonsense)", () => {
    const futureCard = aCard({ lastContactedAt: dayOffset(NOW, 7) });
    const t = computeTemperature(futureCard, NOW);
    expect(t.level).toBe("hot");
    expect(t.daysSince).toBe(0);
  });

  it("emoji+label match level deterministically", () => {
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -1) }), NOW).emoji).toBe(
      "🔥",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -10) }), NOW).emoji).toBe(
      "✨",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -60) }), NOW).emoji).toBe(
      "💫",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -120) }), NOW).emoji).toBe(
      "🌙",
    );
    expect(computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, -365) }), NOW).emoji).toBe(
      "💤",
    );
  });

  it("label is non-empty for every level", () => {
    for (const days of [-1, -10, -60, -120, -365]) {
      const t = computeTemperature(aCard({ lastContactedAt: dayOffset(NOW, days) }), NOW);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});
