import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { daysSinceContact, shouldShowStaleBadge } from "../staleness";

const NOW = new Date("2026-04-24T00:00:00Z");

function mk(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "c1",
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

describe("daysSinceContact", () => {
  it("uses lastContactedAt when present", () => {
    const c = mk({ lastContactedAt: new Date("2026-04-10T00:00:00Z") });
    expect(daysSinceContact(c, NOW)).toBe(14);
  });

  it("falls back to createdAt when lastContactedAt is null", () => {
    const c = mk({ createdAt: new Date("2026-03-25T00:00:00Z") });
    expect(daysSinceContact(c, NOW)).toBe(30);
  });

  it("returns null when both are missing", () => {
    expect(daysSinceContact(mk(), NOW)).toBeNull();
  });

  it("clamps negative values to 0 (future contact dates)", () => {
    const c = mk({ lastContactedAt: new Date("2026-05-01T00:00:00Z") });
    expect(daysSinceContact(c, NOW)).toBe(0);
  });
});

describe("shouldShowStaleBadge", () => {
  it("is true when days ≥ default threshold (30)", () => {
    const c = mk({ lastContactedAt: new Date("2026-03-24T00:00:00Z") });
    expect(shouldShowStaleBadge(c, NOW)).toBe(true);
  });

  it("is false just below threshold", () => {
    const c = mk({ lastContactedAt: new Date("2026-03-26T00:00:00Z") });
    expect(shouldShowStaleBadge(c, NOW)).toBe(false);
  });

  it("respects a custom threshold", () => {
    const c = mk({ lastContactedAt: new Date("2026-04-20T00:00:00Z") });
    expect(shouldShowStaleBadge(c, NOW, 3)).toBe(true);
    expect(shouldShowStaleBadge(c, NOW, 5)).toBe(false);
  });

  it("never shows the badge on a pinned card", () => {
    const c = mk({
      isPinned: true,
      lastContactedAt: new Date("2025-01-01T00:00:00Z"),
    });
    expect(shouldShowStaleBadge(c, NOW)).toBe(false);
  });

  it("is false when both timestamps are missing (no signal)", () => {
    expect(shouldShowStaleBadge(mk(), NOW)).toBe(false);
  });
});
