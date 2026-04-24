import { describe, expect, it } from "vitest";

import type { CardCreateInput } from "@/db/schema";

import { suggestTagsByRules } from "../suggest-rules";

/** Minimal valid CardCreateInput for testing. */
function makeCard(overrides: Partial<CardCreateInput> = {}): CardCreateInput {
  return {
    phones: [],
    emails: [],
    addresses: [],
    social: {},
    tagIds: [],
    tagNames: [],
    whyRemember: "test",
    isPinned: false,
    ...overrides,
  };
}

describe("suggestTagsByRules (skeleton)", () => {
  it("returns [] for a card with all optional fields undefined", () => {
    const result = suggestTagsByRules(makeCard());
    expect(result).toEqual([]);
  });

  it("returns [] for a fully-populated card (no rules implemented yet)", () => {
    const result = suggestTagsByRules(
      makeCard({
        nameZh: "陳志明",
        nameEn: "Alice Chen",
        jobTitleEn: "CEO",
        companyEn: "Google Inc",
        companyZh: "谷歌",
        emails: [{ label: "work", value: "a@university.edu" }],
      }),
    );
    expect(result).toEqual([]);
  });

  it("is pure: same input gives same output across two calls", () => {
    const card = makeCard({ nameEn: "Bob", companyEn: "TSMC" });
    expect(suggestTagsByRules(card)).toEqual(suggestTagsByRules(card));
  });

  it("handles undefined optional fields without throwing", () => {
    expect(() =>
      suggestTagsByRules(
        makeCard({
          nameZh: undefined,
          nameEn: undefined,
          jobTitleEn: undefined,
          companyEn: undefined,
          companyZh: undefined,
        }),
      ),
    ).not.toThrow();
  });

  it("returns an array (not null / undefined)", () => {
    const result = suggestTagsByRules(makeCard());
    expect(Array.isArray(result)).toBe(true);
  });
});
