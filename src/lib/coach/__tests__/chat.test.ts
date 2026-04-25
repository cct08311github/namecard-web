import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import { buildChatMessages, parseChatAnswer, type CardChatContext } from "../chat";

function aCard(over: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-x",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    whyRemember: "Computex 攤位聊邊緣 AI",
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

function ev(at: Date, note: string, id?: string): ContactEvent {
  return {
    id: id ?? `e-${at.getTime()}`,
    at,
    note,
    authorUid: "u",
    authorDisplay: null,
  };
}

describe("buildChatMessages", () => {
  const ctx: CardChatContext = {
    card: aCard({
      jobTitleZh: "PM",
      companyZh: "智威",
      firstMetEventTag: "2024 COMPUTEX",
    }),
    events: [
      ev(new Date(2026, 3, 20), "她公司在募 A 輪"),
      ev(new Date(2026, 3, 10), "demo day pitch deck"),
    ],
  };

  it("returns system + user messages", () => {
    const msgs = buildChatMessages(ctx, "她公司做什麼？");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
  });

  it("system prompt forbids hallucination", () => {
    const msgs = buildChatMessages(ctx, "x");
    expect(msgs[0]!.content).toContain("不要編造");
  });

  it("user prompt includes card name + role + company + question", () => {
    const msgs = buildChatMessages(ctx, "她公司做什麼？");
    expect(msgs[1]!.content).toContain("陳玉涵");
    expect(msgs[1]!.content).toContain("PM");
    expect(msgs[1]!.content).toContain("智威");
    expect(msgs[1]!.content).toContain("她公司做什麼？");
  });

  it("user prompt enumerates events with day prefix", () => {
    const msgs = buildChatMessages(ctx, "x");
    expect(msgs[1]!.content).toContain("- 2026-04-20: 她公司在募 A 輪");
    expect(msgs[1]!.content).toContain("- 2026-04-10: demo day pitch deck");
  });

  it("renders a placeholder when no events", () => {
    const msgs = buildChatMessages({ card: ctx.card, events: [] }, "x");
    expect(msgs[1]!.content).toContain("還沒有 log 任何對話");
  });

  it("drops events with epoch / invalid at", () => {
    const messy: CardChatContext = {
      card: ctx.card,
      events: [ev(new Date(0), "skip me"), ev(new Date(2026, 3, 25), "keep me")],
    };
    const msgs = buildChatMessages(messy, "x");
    expect(msgs[1]!.content).not.toContain("skip me");
    expect(msgs[1]!.content).toContain("keep me");
  });

  it("includes lastContactedAt when present", () => {
    const ctx2: CardChatContext = {
      card: aCard({ lastContactedAt: new Date(2026, 3, 25) }),
      events: [],
    };
    const msgs = buildChatMessages(ctx2, "x");
    expect(msgs[1]!.content).toContain("上次互動: 2026-04-25");
  });

  it("trims whitespace from question", () => {
    const msgs = buildChatMessages(ctx, "   有趣的問題   ");
    expect(msgs[1]!.content).toContain("=== 問題 ===\n有趣的問題");
  });

  it("falls back to nameEn when nameZh missing", () => {
    const msgs = buildChatMessages(
      { card: aCard({ nameZh: undefined, nameEn: "Alice Chen" }), events: [] },
      "x",
    );
    expect(msgs[1]!.content).toContain("姓名: Alice Chen");
  });
});

describe("parseChatAnswer", () => {
  it("returns trimmed string for clean input", () => {
    expect(parseChatAnswer("   她公司在募 A 輪   ")).toBe("她公司在募 A 輪");
  });

  it("strips markdown fence", () => {
    expect(parseChatAnswer("```\nhello\n```")).toBe("hello");
    expect(parseChatAnswer("```text\nhello\n```")).toBe("hello");
  });

  it("returns empty string for empty / whitespace-only", () => {
    expect(parseChatAnswer("")).toBe("");
    expect(parseChatAnswer("   ")).toBe("");
  });

  it("returns empty string for non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(parseChatAnswer(undefined)).toBe("");
    // @ts-expect-error testing runtime guard
    expect(parseChatAnswer(null)).toBe("");
    // @ts-expect-error testing runtime guard
    expect(parseChatAnswer(42)).toBe("");
  });

  it("clamps long answers at 1500 chars", () => {
    const long = "x".repeat(3000);
    expect(parseChatAnswer(long).length).toBe(1500);
  });
});
