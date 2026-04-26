import { describe, expect, it } from "vitest";

import type { AggregatedStats } from "../aggregate";
import { buildDigestMessages, digestCacheMarker, parseDigest } from "../digest";

function emptyStats(over: Partial<AggregatedStats> = {}): AggregatedStats {
  return {
    thisWeek: { logCount: 0, newCardCount: 0, distinctPeople: 0 },
    thisMonth: { logCount: 0, newCardCount: 0, distinctPeople: 0 },
    temperature: { hot: 0, warm: 0, active: 0, quiet: 0, cold: 0 },
    streak: { current: 0, longest: 0 },
    topPeople: [],
    topCompanies: [],
    totalCards: 0,
    ...over,
  };
}

describe("buildDigestMessages", () => {
  it("returns system + user with key numbers", () => {
    const stats = emptyStats({
      thisWeek: { logCount: 5, newCardCount: 2, distinctPeople: 4 },
      streak: { current: 3, longest: 7 },
    });
    const msgs = buildDigestMessages(stats);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.content).toContain("本週 log: 5 次");
    expect(msgs[1]!.content).toContain("4 位不同");
    expect(msgs[1]!.content).toContain("連續 streak: 3 天");
  });

  it("system prompt forbids hallucination of numbers", () => {
    const msgs = buildDigestMessages(emptyStats());
    expect(msgs[0]!.content).toContain("不要編造數字");
  });

  it("includes top person when present", () => {
    const stats = emptyStats({
      topPeople: [
        {
          card: {
            id: "k",
            workspaceId: "w",
            ownerUid: "u",
            memberUids: ["u"],
            nameZh: "Karen",
            whyRemember: "x",
            tagIds: [],
            tagNames: [],
            phones: [],
            emails: [],
            createdAt: null,
            updatedAt: null,
            lastContactedAt: null,
            deletedAt: null,
          },
          logCount: 3,
        },
      ],
    });
    const msgs = buildDigestMessages(stats);
    expect(msgs[1]!.content).toContain("Karen");
    expect(msgs[1]!.content).toContain("3 次");
  });

  it("omits top section when topPeople empty", () => {
    const msgs = buildDigestMessages(emptyStats());
    expect(msgs[1]!.content).not.toContain("本月 top");
  });
});

describe("parseDigest", () => {
  it("returns trimmed string for clean input", () => {
    expect(parseDigest("   本週你 log 5 次   ")).toBe("本週你 log 5 次");
  });

  it("strips markdown fence", () => {
    expect(parseDigest("```\nhello\n```")).toBe("hello");
    expect(parseDigest("```text\nhello\n```")).toBe("hello");
  });

  it("returns empty for empty / whitespace-only", () => {
    expect(parseDigest("")).toBe("");
    expect(parseDigest("   ")).toBe("");
  });

  it("returns empty for non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(parseDigest(undefined)).toBe("");
    // @ts-expect-error testing runtime guard
    expect(parseDigest(null)).toBe("");
    // @ts-expect-error testing runtime guard
    expect(parseDigest(42)).toBe("");
  });

  it("clamps long output at 600 chars", () => {
    const long = "x".repeat(2000);
    expect(parseDigest(long).length).toBe(600);
  });
});

describe("digestCacheMarker", () => {
  it("stable for identical stats", () => {
    const a = emptyStats({ thisWeek: { logCount: 5, newCardCount: 2, distinctPeople: 4 } });
    const b = emptyStats({ thisWeek: { logCount: 5, newCardCount: 2, distinctPeople: 4 } });
    expect(digestCacheMarker(a)).toBe(digestCacheMarker(b));
  });

  it("changes when streak.current changes", () => {
    const a = emptyStats({ streak: { current: 2, longest: 7 } });
    const b = emptyStats({ streak: { current: 3, longest: 7 } });
    expect(digestCacheMarker(a)).not.toBe(digestCacheMarker(b));
  });

  it("changes when week log count changes", () => {
    const a = emptyStats({ thisWeek: { logCount: 5, newCardCount: 2, distinctPeople: 4 } });
    const b = emptyStats({ thisWeek: { logCount: 6, newCardCount: 2, distinctPeople: 4 } });
    expect(digestCacheMarker(a)).not.toBe(digestCacheMarker(b));
  });

  it("changes when top person changes", () => {
    const a = emptyStats({
      topPeople: [
        {
          card: {
            id: "a",
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
          },
          logCount: 3,
        },
      ],
    });
    const b = emptyStats({
      topPeople: [
        {
          card: {
            id: "b",
            workspaceId: "w",
            ownerUid: "u",
            memberUids: ["u"],
            nameZh: "Y",
            whyRemember: "x",
            tagIds: [],
            tagNames: [],
            phones: [],
            emails: [],
            createdAt: null,
            updatedAt: null,
            lastContactedAt: null,
            deletedAt: null,
          },
          logCount: 3,
        },
      ],
    });
    expect(digestCacheMarker(a)).not.toBe(digestCacheMarker(b));
  });

  it("changes when temperature distribution changes", () => {
    const a = emptyStats({
      temperature: { hot: 1, warm: 0, active: 0, quiet: 0, cold: 0 },
    });
    const b = emptyStats({
      temperature: { hot: 0, warm: 1, active: 0, quiet: 0, cold: 0 },
    });
    expect(digestCacheMarker(a)).not.toBe(digestCacheMarker(b));
  });
});
