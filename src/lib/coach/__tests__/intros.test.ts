import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import {
  buildIntrosMessages,
  buildIntrosPrompt,
  introsCacheKey,
  parseIntrosResponse,
  selectIntroCandidates,
} from "../intros";

const NOW = new Date("2026-04-25T10:00:00Z");

function mk(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    jobTitleZh: "PM",
    companyZh: "智威",
    whyRemember: "Computex 邊緣 AI",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    isPinned: false,
    createdAt: new Date("2025-01-01"),
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("selectIntroCandidates", () => {
  it("filters out cards without name or company", () => {
    const noName = mk({ id: "noname", nameZh: undefined, nameEn: undefined });
    const noCompany = mk({ id: "noco", companyZh: undefined, companyEn: undefined });
    const ok = mk({ id: "ok" });
    const out = selectIntroCandidates([noName, noCompany, ok]);
    expect(out.map((c) => c.id)).toEqual(["ok"]);
  });

  it("excludes soft-deleted cards", () => {
    const deleted = mk({ id: "del", deletedAt: new Date() });
    const live = mk({ id: "live" });
    expect(selectIntroCandidates([deleted, live]).map((c) => c.id)).toEqual(["live"]);
  });

  it("prefers pinned cards then most-recently contacted", () => {
    const pinned = mk({ id: "p", isPinned: true });
    const recent = mk({ id: "r", lastContactedAt: new Date("2026-04-20") });
    const old = mk({ id: "o", lastContactedAt: new Date("2024-01-01") });
    const out = selectIntroCandidates([old, recent, pinned], 3);
    expect(out.map((c) => c.id)).toEqual(["p", "r", "o"]);
  });

  it("respects max parameter", () => {
    const cards = Array.from({ length: 50 }, (_, i) => mk({ id: `c${i}` }));
    expect(selectIntroCandidates(cards, 10)).toHaveLength(10);
  });
});

describe("buildIntrosPrompt", () => {
  it("includes each candidate's id, name, role, company", () => {
    const a = mk({ id: "a", nameZh: "Alice", jobTitleZh: "PM", companyZh: "ACME" });
    const b = mk({ id: "b", nameZh: "Bob", jobTitleZh: "BD", companyZh: "Pixel" });
    const prompt = buildIntrosPrompt([a, b]);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Bob");
    expect(prompt).toContain("ACME");
    expect(prompt).toContain("Pixel");
    expect(prompt).toContain("a");
    expect(prompt).toContain("b");
  });

  it("includes whyRemember + firstMetEventTag when present", () => {
    const c = mk({ id: "c", whyRemember: "Computex meet", firstMetEventTag: "2024 COMPUTEX" });
    const prompt = buildIntrosPrompt([c]);
    expect(prompt).toContain("Computex meet");
    expect(prompt).toContain("2024 COMPUTEX");
  });
});

describe("buildIntrosMessages", () => {
  it("returns system + user with the right schema hints", () => {
    const msgs = buildIntrosMessages([mk()]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toContain("intros");
    expect(msgs[0]!.content).toContain("cardAId");
    expect(msgs[0]!.content).toContain("cardBId");
    expect(msgs[0]!.content).toContain("draftEmail");
  });
});

describe("parseIntrosResponse", () => {
  const validIds = new Set(["a", "b", "c", "d"]);

  it("parses a clean intros JSON", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "a", cardBId: "b", reason: "互補", draftEmail: "Hi A and B..." },
        { cardAId: "c", cardBId: "d", reason: "同產業", draftEmail: "Hi C and D..." },
      ],
    });
    const out = parseIntrosResponse(raw, validIds);
    expect(out).toHaveLength(2);
    expect(out[0]!.cardAId).toBe("a");
    expect(out[0]!.cardBId).toBe("b");
  });

  it("strips markdown json fence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        intros: [{ cardAId: "a", cardBId: "b", reason: "x", draftEmail: "y" }],
      }) +
      "\n```";
    expect(parseIntrosResponse(raw, validIds)).toHaveLength(1);
  });

  it("drops pairs with cardId not in valid set (anti-hallucination)", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "a", cardBId: "MADE-UP", reason: "x", draftEmail: "y" },
        { cardAId: "a", cardBId: "b", reason: "x", draftEmail: "y" },
      ],
    });
    const out = parseIntrosResponse(raw, validIds);
    expect(out).toHaveLength(1);
    expect(out[0]!.cardBId).toBe("b");
  });

  it("drops self-pairs (cardA === cardB)", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "a", cardBId: "a", reason: "x", draftEmail: "y" },
        { cardAId: "a", cardBId: "b", reason: "x", draftEmail: "y" },
      ],
    });
    const out = parseIntrosResponse(raw, validIds);
    expect(out).toHaveLength(1);
    expect(out[0]!.cardAId).toBe("a");
    expect(out[0]!.cardBId).toBe("b");
  });

  it("dedupes (A,B) and (B,A) as the same pair", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "a", cardBId: "b", reason: "x", draftEmail: "y" },
        { cardAId: "b", cardBId: "a", reason: "different reason", draftEmail: "y" },
      ],
    });
    expect(parseIntrosResponse(raw, validIds)).toHaveLength(1);
  });

  it("drops pairs missing reason or draftEmail", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "a", cardBId: "b" },
        { cardAId: "c", cardBId: "d", reason: "x" },
        { cardAId: "a", cardBId: "c", reason: "x", draftEmail: "y" },
      ],
    });
    const out = parseIntrosResponse(raw, validIds);
    expect(out).toHaveLength(1);
    expect(out[0]!.cardAId).toBe("a");
    expect(out[0]!.cardBId).toBe("c");
  });

  it("caps at 5 picks", () => {
    const raw = JSON.stringify({
      intros: Array.from({ length: 10 }, (_, i) => ({
        cardAId: i % 2 === 0 ? "a" : "c",
        cardBId: i % 2 === 0 ? "b" : "d",
        reason: `r${i}`,
        draftEmail: `e${i}`,
      })),
    });
    expect(parseIntrosResponse(raw, validIds).length).toBeLessThanOrEqual(5);
  });

  it("returns empty on malformed JSON", () => {
    expect(parseIntrosResponse("not json", validIds)).toEqual([]);
  });

  it("returns empty on empty string", () => {
    expect(parseIntrosResponse("", validIds)).toEqual([]);
  });

  it("returns empty on null/non-object root", () => {
    expect(parseIntrosResponse("null", validIds)).toEqual([]);
    expect(parseIntrosResponse('"a string"', validIds)).toEqual([]);
  });

  it("returns empty when intros field is missing or not an array", () => {
    expect(parseIntrosResponse(JSON.stringify({}), validIds)).toEqual([]);
    expect(parseIntrosResponse(JSON.stringify({ intros: "not-array" }), validIds)).toEqual([]);
  });

  it("drops null / non-object items inside intros array", () => {
    const raw = JSON.stringify({
      intros: [null, "string", 42, { cardAId: "a", cardBId: "b", reason: "x", draftEmail: "y" }],
    });
    expect(parseIntrosResponse(raw, validIds)).toHaveLength(1);
  });

  it("drops items where cardAId / cardBId is missing or non-string", () => {
    const raw = JSON.stringify({
      intros: [
        { cardAId: "", cardBId: "b", reason: "x", draftEmail: "y" },
        { cardAId: "a", cardBId: "", reason: "x", draftEmail: "y" },
        { cardAId: 42, cardBId: "b", reason: "x", draftEmail: "y" },
        { cardAId: "a", cardBId: "c", reason: "x", draftEmail: "y" },
      ],
    });
    expect(parseIntrosResponse(raw, validIds)).toHaveLength(1);
  });
});

describe("introsCacheKey", () => {
  it("is stable for same week + candidate set", () => {
    const a = introsCacheKey(NOW, ["c1", "c2"]);
    const b = introsCacheKey(NOW, ["c1", "c2"]);
    expect(a).toBe(b);
  });

  it("is order-independent on candidate ids", () => {
    const a = introsCacheKey(NOW, ["c1", "c2", "c3"]);
    const b = introsCacheKey(NOW, ["c3", "c1", "c2"]);
    expect(a).toBe(b);
  });

  it("changes when crossing a week boundary", () => {
    const today = introsCacheKey(NOW, ["a"]);
    const nextWeek = introsCacheKey(new Date(NOW.getTime() + 8 * 86400 * 1000), ["a"]);
    expect(today).not.toBe(nextWeek);
  });

  it("changes when candidate set changes", () => {
    const a = introsCacheKey(NOW, ["c1", "c2"]);
    const b = introsCacheKey(NOW, ["c1", "c2", "c3"]);
    expect(a).not.toBe(b);
  });
});
