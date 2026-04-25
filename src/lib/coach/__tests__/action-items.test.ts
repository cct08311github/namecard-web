import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";
import type { RecapItem } from "@/lib/recap/group";

import {
  actionItemsCacheMarker,
  buildActionItemsMessages,
  parseActionItems,
} from "../action-items";

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

function mkItem(cardId: string, name: string, note: string, at = new Date(2026, 3, 25)): RecapItem {
  const event: ContactEvent = {
    id: `e-${cardId}`,
    at,
    note,
    authorUid: "u",
    authorDisplay: null,
  };
  return { card: aCard({ id: cardId, nameZh: name }), event };
}

describe("buildActionItemsMessages", () => {
  it("returns system + user messages with each item enumerated and cardId prefixed", () => {
    const items = [
      mkItem("c1", "陳玉涵", "她要 pitch deck，我答應週五前寄"),
      mkItem("c2", "Karen", "她要我介紹 NVIDIA contact"),
    ];
    const msgs = buildActionItemsMessages(items);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toContain("使用者本人");
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain("cardId=c1");
    expect(msgs[1]!.content).toContain("cardId=c2");
    expect(msgs[1]!.content).toContain("陳玉涵");
    expect(msgs[1]!.content).toContain("pitch deck");
  });

  it("renders epoch event.at as empty date prefix (no 1970 leak)", () => {
    const items = [mkItem("c1", "X", "...", new Date(0))];
    const msgs = buildActionItemsMessages(items);
    expect(msgs[1]!.content).not.toContain("1970");
  });

  it("falls back to （未命名） when both names missing", () => {
    const item: RecapItem = {
      card: aCard({ id: "anon", nameZh: undefined, nameEn: undefined }),
      event: {
        id: "e",
        at: new Date(2026, 3, 25),
        note: "X",
        authorUid: "u",
        authorDisplay: null,
      },
    };
    const msgs = buildActionItemsMessages([item]);
    expect(msgs[1]!.content).toContain("（未命名）");
  });
});

describe("parseActionItems", () => {
  const validIds = new Set(["c1", "c2", "c3"]);

  it("parses a clean response", () => {
    const raw = JSON.stringify({
      items: [
        { cardId: "c1", action: "週五前寄 pitch deck", dueHint: "週五前" },
        { cardId: "c2", action: "介紹 NVIDIA contact" },
      ],
    });
    const result = parseActionItems(raw, validIds);
    expect(result).toEqual([
      { cardId: "c1", action: "週五前寄 pitch deck", dueHint: "週五前" },
      { cardId: "c2", action: "介紹 NVIDIA contact" },
    ]);
  });

  it("strips markdown json fence", () => {
    const raw = "```json\n" + JSON.stringify({ items: [{ cardId: "c1", action: "x" }] }) + "\n```";
    expect(parseActionItems(raw, validIds)).toHaveLength(1);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseActionItems("not json", validIds)).toEqual([]);
  });

  it("returns [] when items field missing", () => {
    expect(parseActionItems(JSON.stringify({ other: 1 }), validIds)).toEqual([]);
  });

  it("returns [] when root is array", () => {
    expect(parseActionItems("[1,2]", validIds)).toEqual([]);
  });

  it("drops items with hallucinated cardId", () => {
    const raw = JSON.stringify({
      items: [
        { cardId: "c1", action: "x" },
        { cardId: "MADE-UP", action: "y" },
        { cardId: "c2", action: "z" },
      ],
    });
    const result = parseActionItems(raw, validIds);
    expect(result.map((i) => i.cardId)).toEqual(["c1", "c2"]);
  });

  it("drops items missing action", () => {
    const raw = JSON.stringify({
      items: [{ cardId: "c1" }, { cardId: "c2", action: "" }, { cardId: "c3", action: "good" }],
    });
    const result = parseActionItems(raw, validIds);
    expect(result.map((i) => i.cardId)).toEqual(["c3"]);
  });

  it("clamps action to 120 chars", () => {
    const long = "x".repeat(500);
    const raw = JSON.stringify({ items: [{ cardId: "c1", action: long }] });
    expect(parseActionItems(raw, validIds)[0]!.action.length).toBe(120);
  });

  it("clamps dueHint to 30 chars", () => {
    const long = "x".repeat(100);
    const raw = JSON.stringify({ items: [{ cardId: "c1", action: "x", dueHint: long }] });
    expect(parseActionItems(raw, validIds)[0]!.dueHint!.length).toBe(30);
  });

  it("omits dueHint when empty / non-string", () => {
    const raw = JSON.stringify({
      items: [
        { cardId: "c1", action: "a", dueHint: "" },
        { cardId: "c2", action: "b", dueHint: 42 },
      ],
    });
    const result = parseActionItems(raw, validIds);
    expect(result[0]!.dueHint).toBeUndefined();
    expect(result[1]!.dueHint).toBeUndefined();
  });

  it("caps at 5 items even if LLM returns more", () => {
    const raw = JSON.stringify({
      items: Array.from({ length: 10 }, (_, i) => ({
        cardId: i % 3 === 0 ? "c1" : i % 3 === 1 ? "c2" : "c3",
        action: `act-${i}`,
      })),
    });
    expect(parseActionItems(raw, validIds).length).toBe(5);
  });

  it("trims whitespace from action and dueHint", () => {
    const raw = JSON.stringify({
      items: [{ cardId: "c1", action: "  寄 deck  ", dueHint: "  週五  " }],
    });
    const result = parseActionItems(raw, validIds)[0]!;
    expect(result.action).toBe("寄 deck");
    expect(result.dueHint).toBe("週五");
  });

  it("ignores non-object entries in items array", () => {
    const raw = JSON.stringify({
      items: [null, "string", 42, { cardId: "c1", action: "good" }, [1, 2]],
    });
    const result = parseActionItems(raw, validIds);
    expect(result).toEqual([{ cardId: "c1", action: "good" }]);
  });
});

describe("actionItemsCacheMarker", () => {
  const ev = (at: Date): ContactEvent => ({
    id: `e-${at.getTime()}`,
    at,
    note: "n",
    authorUid: "u",
    authorDisplay: null,
  });

  it("returns 'empty' for no items", () => {
    expect(actionItemsCacheMarker([])).toBe("empty");
  });

  it("includes count and max timestamp", () => {
    const a = { card: aCard({ id: "a" }), event: ev(new Date(2026, 3, 25)) };
    const b = { card: aCard({ id: "b" }), event: ev(new Date(2026, 3, 26)) };
    const marker = actionItemsCacheMarker([a, b]);
    expect(marker).toContain("n=2");
    expect(marker).toContain(`max=${b.event.at.getTime()}`);
  });

  it("changes when a new event arrives", () => {
    const a = { card: aCard({ id: "a" }), event: ev(new Date(2026, 3, 25)) };
    const before = actionItemsCacheMarker([a]);
    const b = { card: aCard({ id: "b" }), event: ev(new Date(2026, 3, 26)) };
    const after = actionItemsCacheMarker([a, b]);
    expect(before).not.toBe(after);
  });
});
