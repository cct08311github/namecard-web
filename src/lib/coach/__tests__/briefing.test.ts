import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import {
  briefingCacheKey,
  buildBriefingMessages,
  buildBriefingPrompt,
  parseBriefingResponse,
} from "../briefing";
import type { PriorityCandidate } from "../priority";

const NOW = new Date("2026-04-25T10:00:00Z");

function mkCandidate(overrides: Partial<CardSummary & PriorityCandidate> = {}): PriorityCandidate {
  const card: CardSummary = {
    id: "card-1",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    jobTitleZh: "PM",
    companyZh: "智威",
    whyRemember: "Computex 攤位聊邊緣 AI",
    firstMetDate: "2024-06-04",
    firstMetEventTag: "2024 COMPUTEX",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    isPinned: false,
    createdAt: new Date("2024-06-04"),
    updatedAt: null,
    lastContactedAt: new Date("2025-09-01"),
    deletedAt: null,
    ...(overrides as Partial<CardSummary>),
  };
  return {
    card,
    score: overrides.score ?? 100,
    reason: overrides.reason ?? "followup-overdue",
    daysOffset: overrides.daysOffset ?? 5,
  };
}

describe("buildBriefingPrompt", () => {
  it("includes today's date", () => {
    const prompt = buildBriefingPrompt([mkCandidate()], NOW);
    expect(prompt).toContain("2026-04-25");
  });

  it("includes each candidate's name, role, company", () => {
    const c1 = mkCandidate({ id: "c1", nameZh: "Alice" });
    const c2 = mkCandidate({ id: "c2", nameZh: "Bob", companyZh: "ACME" });
    const prompt = buildBriefingPrompt([c1, c2], NOW);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Bob");
    expect(prompt).toContain("ACME");
    expect(prompt).toContain("c1");
    expect(prompt).toContain("c2");
  });

  it("surfaces the system score and reason kind", () => {
    const c = mkCandidate({ score: 142, reason: "followup-overdue", daysOffset: 7 });
    const prompt = buildBriefingPrompt([c], NOW);
    expect(prompt).toContain("評分=142");
    expect(prompt).toContain("提醒已過期 7 天");
  });

  it("anniversary daysOffset reads as 'N 年前的今天認識'", () => {
    const c = mkCandidate({ reason: "anniversary", daysOffset: 5, score: 100 });
    const prompt = buildBriefingPrompt([c], NOW);
    expect(prompt).toContain("5 年前的今天認識");
  });

  it("pinned-stale shows days-since-contact", () => {
    const c = mkCandidate({
      reason: "pinned-stale",
      daysOffset: 30,
      isPinned: true,
    } as Partial<CardSummary & PriorityCandidate>);
    const prompt = buildBriefingPrompt([c], NOW);
    expect(prompt).toContain("已 30 天沒互動");
    expect(prompt).toContain("重要聯絡人");
  });
});

describe("buildBriefingMessages", () => {
  it("returns system + user messages with the right schema hints", () => {
    const msgs = buildBriefingMessages([mkCandidate()], NOW);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toContain("picks");
    expect(msgs[0]!.content).toContain("cardId");
    expect(msgs[0]!.content).toContain("reason");
    expect(msgs[0]!.content).toContain("suggestedAction");
  });
});

describe("parseBriefingResponse", () => {
  const validIds = new Set(["a", "b", "c"]);

  it("parses a clean JSON response", () => {
    const raw = JSON.stringify({
      picks: [
        { cardId: "a", reason: "因為 X", suggestedAction: "寄個訊息" },
        { cardId: "b", reason: "因為 Y", suggestedAction: "打通電話" },
      ],
    });
    const result = parseBriefingResponse(raw, validIds);
    expect(result).toHaveLength(2);
    expect(result[0]!.cardId).toBe("a");
    expect(result[0]!.suggestedAction).toBe("寄個訊息");
  });

  it("strips markdown json fence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({ picks: [{ cardId: "a", reason: "x", suggestedAction: "y" }] }) +
      "\n```";
    const result = parseBriefingResponse(raw, validIds);
    expect(result).toHaveLength(1);
  });

  it("drops picks whose cardId is not in the candidate set (anti-hallucination)", () => {
    const raw = JSON.stringify({
      picks: [
        { cardId: "a", reason: "x", suggestedAction: "y" },
        { cardId: "MADE-UP-ID", reason: "x", suggestedAction: "y" },
      ],
    });
    const result = parseBriefingResponse(raw, validIds);
    expect(result.map((p) => p.cardId)).toEqual(["a"]);
  });

  it("drops picks missing reason or suggestedAction", () => {
    const raw = JSON.stringify({
      picks: [
        { cardId: "a" },
        { cardId: "b", reason: "x" },
        { cardId: "c", reason: "x", suggestedAction: "y" },
      ],
    });
    const result = parseBriefingResponse(raw, validIds);
    expect(result.map((p) => p.cardId)).toEqual(["c"]);
  });

  it("caps at 3 picks even if LLM returns more", () => {
    const raw = JSON.stringify({
      picks: Array.from({ length: 8 }, (_, i) => ({
        cardId: i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : "c",
        reason: `r${i}`,
        suggestedAction: `a${i}`,
      })),
    });
    const result = parseBriefingResponse(raw, validIds);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns empty on malformed JSON", () => {
    expect(parseBriefingResponse("not json", validIds)).toEqual([]);
  });

  it("returns empty when picks is missing", () => {
    expect(parseBriefingResponse(JSON.stringify({ other: 1 }), validIds)).toEqual([]);
  });
});

describe("briefingCacheKey", () => {
  it("is stable for same date + candidate set", () => {
    const a = briefingCacheKey(NOW, ["c1", "c2", "c3"]);
    const b = briefingCacheKey(NOW, ["c1", "c2", "c3"]);
    expect(a).toBe(b);
  });

  it("is order-independent on candidate ids", () => {
    const a = briefingCacheKey(NOW, ["c1", "c2", "c3"]);
    const b = briefingCacheKey(NOW, ["c3", "c1", "c2"]);
    expect(a).toBe(b);
  });

  it("changes when the date changes", () => {
    const today = briefingCacheKey(NOW, ["a"]);
    const tomorrow = briefingCacheKey(new Date("2026-04-26T10:00:00Z"), ["a"]);
    expect(today).not.toBe(tomorrow);
  });

  it("changes when the candidate set changes", () => {
    const a = briefingCacheKey(NOW, ["c1", "c2"]);
    const b = briefingCacheKey(NOW, ["c1", "c2", "c3"]);
    expect(a).not.toBe(b);
  });
});
