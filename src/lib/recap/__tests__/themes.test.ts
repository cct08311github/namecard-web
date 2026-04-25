import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import type { RecapItem } from "../group";
import { buildThemesMessages, parseThemes, themesCacheMarker } from "../themes";

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

function mkItem(at: Date, note: string, name?: string): RecapItem {
  const event: ContactEvent = {
    id: `e-${at.getTime()}`,
    at,
    note,
    authorUid: "u",
    authorDisplay: null,
  };
  return { card: aCard({ id: name || "x", nameZh: name }), event };
}

describe("buildThemesMessages", () => {
  it("returns system + user messages with each item enumerated", () => {
    const msgs = buildThemesMessages([
      mkItem(new Date("2026-04-25"), "她公司在募 A 輪", "陳玉涵"),
      mkItem(new Date("2026-04-24"), "demo day pitch deck", "Karen"),
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain("1. 跟 陳玉涵 聊：");
    expect(msgs[1]!.content).toContain("2. 跟 Karen 聊：");
    expect(msgs[1]!.content).toContain("demo day pitch deck");
  });

  it("falls back to （人 N） when card has no name", () => {
    const item: RecapItem = {
      card: aCard({ id: "no-name", nameZh: undefined, nameEn: undefined }),
      event: {
        id: "e",
        at: new Date(),
        note: "聊到 X",
        authorUid: "u",
        authorDisplay: null,
      },
    };
    const msgs = buildThemesMessages([item]);
    expect(msgs[1]!.content).toContain("（人 1）");
  });
});

describe("parseThemes", () => {
  it("parses a clean JSON array", () => {
    const raw = JSON.stringify({ themes: ["AI 政策", "SaaS 估值", "demo day"] });
    expect(parseThemes(raw)).toEqual(["AI 政策", "SaaS 估值", "demo day"]);
  });

  it("strips markdown json fence", () => {
    const raw = "```json\n" + JSON.stringify({ themes: ["X"] }) + "\n```";
    expect(parseThemes(raw)).toEqual(["X"]);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseThemes("not json")).toEqual([]);
  });

  it("returns [] on empty input", () => {
    expect(parseThemes("")).toEqual([]);
  });

  it("returns [] when root is not an object", () => {
    expect(parseThemes("[1,2,3]")).toEqual([]);
    expect(parseThemes("42")).toEqual([]);
  });

  it("returns [] when themes field missing or not array", () => {
    expect(parseThemes(JSON.stringify({ other: 1 }))).toEqual([]);
    expect(parseThemes(JSON.stringify({ themes: "string" }))).toEqual([]);
  });

  it("drops non-string items", () => {
    const raw = JSON.stringify({ themes: ["good", 42, null, "also-good"] });
    expect(parseThemes(raw)).toEqual(["good", "also-good"]);
  });

  it("drops empty / whitespace-only items", () => {
    const raw = JSON.stringify({ themes: ["", "  ", "good"] });
    expect(parseThemes(raw)).toEqual(["good"]);
  });

  it("drops oversized items (>30 chars)", () => {
    const longText = "x".repeat(50);
    const raw = JSON.stringify({ themes: [longText, "ok"] });
    expect(parseThemes(raw)).toEqual(["ok"]);
  });

  it("caps at 5 themes even if LLM returns more", () => {
    const raw = JSON.stringify({ themes: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(parseThemes(raw)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("trims surrounding whitespace from items", () => {
    const raw = JSON.stringify({ themes: ["  spaced  ", "tight"] });
    expect(parseThemes(raw)).toEqual(["spaced", "tight"]);
  });
});

describe("themesCacheMarker", () => {
  it("returns 'empty' for no items", () => {
    expect(themesCacheMarker([])).toBe("empty");
  });

  it("includes count and max timestamp", () => {
    const a = mkItem(new Date(2026, 3, 25, 9), "x");
    const b = mkItem(new Date(2026, 3, 26, 9), "y");
    const marker = themesCacheMarker([a, b]);
    expect(marker).toContain("n=2");
    expect(marker).toContain(`max=${b.event.at.getTime()}`);
  });

  it("changes when a new event arrives", () => {
    const a = mkItem(new Date(2026, 3, 25), "x");
    const before = themesCacheMarker([a]);
    const b = mkItem(new Date(2026, 3, 26), "y");
    const after = themesCacheMarker([a, b]);
    expect(before).not.toBe(after);
  });

  it("stable for identical inputs (no LLM credit burn on reload)", () => {
    const a = mkItem(new Date(2026, 3, 25), "x");
    const m1 = themesCacheMarker([a]);
    const m2 = themesCacheMarker([a]);
    expect(m1).toBe(m2);
  });
});
