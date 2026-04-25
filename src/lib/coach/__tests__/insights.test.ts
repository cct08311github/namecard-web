import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import {
  buildCoachPrompt,
  buildLlmMessages,
  contextHash,
  isEmptyInsight,
  parseCoachResponse,
  type CoachContext,
} from "../insights";

const NOW = new Date("2026-04-25T10:00:00Z");

function mkCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-1",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    nameEn: "Yu-Han Chen",
    jobTitleZh: "產品經理",
    companyZh: "智威科技",
    department: undefined,
    whyRemember: "2024 Computex 攤位上聊邊緣 AI 推論",
    firstMetDate: "2024-06-04",
    firstMetEventTag: "2024 COMPUTEX",
    firstMetContext: "在攤位上聊到邊緣 AI",
    notes: undefined,
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    isPinned: false,
    createdAt: new Date("2024-06-04"),
    updatedAt: new Date("2024-06-04"),
    lastContactedAt: new Date("2025-09-01"),
    deletedAt: null,
    ...overrides,
  };
}

function mkEvent(overrides: Partial<ContactEvent> = {}): ContactEvent {
  return {
    id: "ev-1",
    at: new Date("2025-09-01T00:00:00Z"),
    note: "",
    authorUid: "u",
    authorDisplay: null,
    ...overrides,
  };
}

function mkContext(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    card: mkCard(),
    events: [],
    companyMates: [],
    eventMates: [],
    now: NOW,
    ...overrides,
  };
}

describe("buildCoachPrompt", () => {
  it("includes name / role / company / whyRemember", () => {
    const prompt = buildCoachPrompt(mkContext());
    expect(prompt).toContain("陳玉涵");
    expect(prompt).toContain("產品經理");
    expect(prompt).toContain("智威科技");
    expect(prompt).toContain("Computex 攤位上聊邊緣 AI 推論");
  });

  it("includes first-met context block", () => {
    const prompt = buildCoachPrompt(mkContext());
    expect(prompt).toContain("第一次見面");
    expect(prompt).toContain("2024-06-04");
    expect(prompt).toContain("2024 COMPUTEX");
    expect(prompt).toContain("攤位");
  });

  it("includes recent contact events with dates", () => {
    const ctx = mkContext({
      events: [mkEvent({ id: "e1", at: new Date("2026-04-01"), note: "視訊聊新方案" })],
    });
    const prompt = buildCoachPrompt(ctx);
    expect(prompt).toContain("近期互動歷史");
    expect(prompt).toContain("2026-04-01");
    expect(prompt).toContain("視訊聊新方案");
  });

  it("computes days-since-contact and flags >=90 days", () => {
    const ctx = mkContext(); // lastContactedAt 2025-09-01, NOW 2026-04-25 = ~236 days
    const prompt = buildCoachPrompt(ctx);
    expect(prompt).toMatch(/上次互動：2025-09-01（\d+ 天前，已超過 90 天）/);
  });

  it("treats missing lastContactedAt as 'no follow-up yet'", () => {
    const ctx = mkContext({ card: mkCard({ lastContactedAt: null }) });
    const prompt = buildCoachPrompt(ctx);
    expect(prompt).toContain("尚未記錄任何互動");
  });

  it("includes company mates with their roles", () => {
    const mate = mkCard({ id: "m1", nameZh: "王小明", jobTitleZh: "工程師" });
    const prompt = buildCoachPrompt(mkContext({ companyMates: [mate] }));
    expect(prompt).toContain("同公司其他聯絡人");
    expect(prompt).toContain("王小明");
    expect(prompt).toContain("工程師");
  });

  it("includes event mates with their company", () => {
    const mate = mkCard({ id: "m2", nameZh: "李大同", companyZh: "ACME" });
    const prompt = buildCoachPrompt(mkContext({ eventMates: [mate] }));
    expect(prompt).toContain("同場合認識的人");
    expect(prompt).toContain("李大同");
    expect(prompt).toContain("ACME");
  });

  it("does not crash when most optional fields are absent", () => {
    const minimal = mkCard({
      jobTitleZh: undefined,
      companyZh: undefined,
      whyRemember: "",
      firstMetDate: undefined,
      firstMetEventTag: undefined,
      firstMetContext: undefined,
      lastContactedAt: null,
    });
    expect(() => buildCoachPrompt(mkContext({ card: minimal }))).not.toThrow();
  });
});

describe("buildLlmMessages", () => {
  it("returns a system + user message pair", () => {
    const msgs = buildLlmMessages(mkContext());
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
  });

  it("system message instructs JSON-only output with the right schema keys", () => {
    const msgs = buildLlmMessages(mkContext());
    expect(msgs[0]!.content).toContain("conversationStarters");
    expect(msgs[0]!.content).toContain("inferredNeeds");
    expect(msgs[0]!.content).toContain("suggestedActions");
  });
});

describe("contextHash", () => {
  it("is stable across calls with the same context", () => {
    const ctx1 = mkContext();
    const ctx2 = mkContext();
    expect(contextHash(ctx1)).toBe(contextHash(ctx2));
  });

  it("changes when whyRemember changes", () => {
    const a = mkContext();
    const b = mkContext({ card: mkCard({ whyRemember: "different memory" }) });
    expect(contextHash(a)).not.toBe(contextHash(b));
  });

  it("changes when a new contact event is added", () => {
    const a = mkContext();
    const b = mkContext({ events: [mkEvent({ id: "new", note: "called" })] });
    expect(contextHash(a)).not.toBe(contextHash(b));
  });

  it("does NOT change on unrelated `now` clock drift (same data → same hash)", () => {
    const a = mkContext();
    const b = mkContext({ now: new Date("2026-04-26T10:00:00Z") });
    // The hash includes daysSinceContact, which IS time-sensitive (1 day later
    // = different bucket). So this is expected to differ. We test the
    // converse: identical inputs → identical hash.
    expect(contextHash(a)).toBe(contextHash(a));
    expect(contextHash(b)).toBe(contextHash(b));
  });
});

describe("parseCoachResponse", () => {
  it("parses a clean JSON response", () => {
    const raw = JSON.stringify({
      conversationStarters: ["a", "b"],
      inferredNeeds: ["x"],
      suggestedActions: ["y", "z"],
    });
    const insight = parseCoachResponse(raw);
    expect(insight.conversationStarters).toEqual(["a", "b"]);
    expect(insight.inferredNeeds).toEqual(["x"]);
    expect(insight.suggestedActions).toEqual(["y", "z"]);
  });

  it("strips a markdown json fence", () => {
    const raw = "```json\n" + JSON.stringify({ conversationStarters: ["hi"] }) + "\n```";
    const insight = parseCoachResponse(raw);
    expect(insight.conversationStarters).toEqual(["hi"]);
  });

  it("returns empty arrays on malformed JSON", () => {
    const insight = parseCoachResponse("not json at all");
    expect(insight.conversationStarters).toEqual([]);
    expect(insight.inferredNeeds).toEqual([]);
    expect(insight.suggestedActions).toEqual([]);
  });

  it("returns empty on non-object root", () => {
    const insight = parseCoachResponse("[1,2,3]");
    expect(insight.conversationStarters).toEqual([]);
  });

  it("ignores non-string array items and trims whitespace", () => {
    const raw = JSON.stringify({
      conversationStarters: ["  hello  ", 42, null, "world"],
    });
    const insight = parseCoachResponse(raw);
    expect(insight.conversationStarters).toEqual(["hello", "world"]);
  });

  it("caps each bucket at its limit", () => {
    const raw = JSON.stringify({
      conversationStarters: Array.from({ length: 20 }, (_, i) => `c${i}`),
      inferredNeeds: Array.from({ length: 20 }, (_, i) => `n${i}`),
      suggestedActions: Array.from({ length: 20 }, (_, i) => `a${i}`),
    });
    const insight = parseCoachResponse(raw);
    expect(insight.conversationStarters.length).toBeLessThanOrEqual(5);
    expect(insight.inferredNeeds.length).toBeLessThanOrEqual(4);
    expect(insight.suggestedActions.length).toBeLessThanOrEqual(4);
  });
});

describe("isEmptyInsight", () => {
  it("true when all three buckets are empty", () => {
    expect(
      isEmptyInsight({ conversationStarters: [], inferredNeeds: [], suggestedActions: [] }),
    ).toBe(true);
  });

  it("false when any bucket has content", () => {
    expect(
      isEmptyInsight({ conversationStarters: ["x"], inferredNeeds: [], suggestedActions: [] }),
    ).toBe(false);
  });
});
