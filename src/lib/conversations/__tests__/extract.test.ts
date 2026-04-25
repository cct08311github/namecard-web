import { describe, expect, it } from "vitest";

import { buildConversationMessages, parseConversationLog } from "../extract";

describe("buildConversationMessages", () => {
  it("returns system + user messages with the user's text", () => {
    const msgs = buildConversationMessages("今天跟陳玉涵聊到 A 輪");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain("陳玉涵");
  });

  it("system prompt includes both personName and summary fields", () => {
    const msgs = buildConversationMessages("x");
    expect(msgs[0]!.content).toContain("personName");
    expect(msgs[0]!.content).toContain("summary");
  });
});

describe("parseConversationLog", () => {
  it("parses a clean response", () => {
    const raw = JSON.stringify({
      personName: "陳玉涵",
      summary: "他公司在募 A 輪、看 SaaS 估值",
    });
    const result = parseConversationLog(raw, "fallback");
    expect(result).toEqual({
      personName: "陳玉涵",
      summary: "他公司在募 A 輪、看 SaaS 估值",
    });
  });

  it("strips markdown json fence", () => {
    const raw = "```json\n" + JSON.stringify({ personName: "A", summary: "x" }) + "\n```";
    expect(parseConversationLog(raw, "fb")?.personName).toBe("A");
  });

  it("returns null on malformed JSON", () => {
    expect(parseConversationLog("not json", "fb")).toBeNull();
  });

  it("returns null on empty raw", () => {
    expect(parseConversationLog("", "fb")).toBeNull();
  });

  it("returns null on array root", () => {
    expect(parseConversationLog("[1,2]", "fb")).toBeNull();
  });

  it("returns null on primitive root", () => {
    expect(parseConversationLog("42", "fb")).toBeNull();
  });

  it("returns null when personName missing", () => {
    const raw = JSON.stringify({ summary: "x" });
    expect(parseConversationLog(raw, "fb")).toBeNull();
  });

  it("returns null when personName is empty string", () => {
    const raw = JSON.stringify({ personName: "  ", summary: "x" });
    expect(parseConversationLog(raw, "fb")).toBeNull();
  });

  it("returns null when personName is a non-string", () => {
    const raw = JSON.stringify({ personName: 42, summary: "x" });
    expect(parseConversationLog(raw, "fb")).toBeNull();
  });

  it("falls back to truncated input when summary missing", () => {
    const raw = JSON.stringify({ personName: "陳玉涵" });
    const result = parseConversationLog(raw, "原始輸入");
    expect(result?.personName).toBe("陳玉涵");
    expect(result?.summary).toBe("原始輸入");
  });

  it("uses placeholder when both summary and fallback are empty", () => {
    const raw = JSON.stringify({ personName: "X" });
    expect(parseConversationLog(raw, "")?.summary).toBe("（對話）");
  });

  it("clamps long summary to 500 chars", () => {
    const longText = "x".repeat(2000);
    const raw = JSON.stringify({ personName: "Alice", summary: longText });
    const result = parseConversationLog(raw, "fb")!;
    expect(result.summary.length).toBe(500);
  });

  it("clamps long personName to 100 chars", () => {
    const longText = "n".repeat(2000);
    const raw = JSON.stringify({ personName: longText, summary: "x" });
    const result = parseConversationLog(raw, "fb")!;
    expect(result.personName.length).toBe(100);
  });

  it("trims surrounding whitespace from both fields", () => {
    const raw = JSON.stringify({ personName: "  陳玉涵  ", summary: "  hello  " });
    const result = parseConversationLog(raw, "fb")!;
    expect(result.personName).toBe("陳玉涵");
    expect(result.summary).toBe("hello");
  });
});
