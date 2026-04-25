import { describe, expect, it } from "vitest";

import {
  buildExtractMessages,
  decodePrefill,
  encodePrefill,
  parseExtractedCard,
  parseMultipleExtractedCards,
  type ExtractedCard,
} from "../extract";

describe("buildExtractMessages", () => {
  it("returns system + user messages with the user's text in user content", () => {
    const msgs = buildExtractMessages("陳玉涵 PM 智威");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain("陳玉涵");
  });

  it("system prompt includes JSON schema hints", () => {
    const msgs = buildExtractMessages("test");
    expect(msgs[0]!.content).toContain("nameZh");
    expect(msgs[0]!.content).toContain("companyZh");
    expect(msgs[0]!.content).toContain("whyRemember");
  });
});

describe("parseExtractedCard", () => {
  it("parses a clean response into ExtractedCard", () => {
    const raw = JSON.stringify({
      nameZh: "陳玉涵",
      jobTitleZh: "PM",
      companyZh: "智威科技",
      firstMetEventTag: "2024 COMPUTEX",
      whyRemember: "Computex 攤位聊邊緣 AI",
    });
    const result = parseExtractedCard(raw, "fallback");
    expect(result?.nameZh).toBe("陳玉涵");
    expect(result?.jobTitleZh).toBe("PM");
    expect(result?.companyZh).toBe("智威科技");
    expect(result?.firstMetEventTag).toBe("2024 COMPUTEX");
    expect(result?.whyRemember).toBe("Computex 攤位聊邊緣 AI");
  });

  it("strips markdown json fence", () => {
    const raw = "```json\n" + JSON.stringify({ whyRemember: "x" }) + "\n```";
    expect(parseExtractedCard(raw, "f")?.whyRemember).toBe("x");
  });

  it("returns null on malformed JSON", () => {
    expect(parseExtractedCard("not json", "f")).toBeNull();
  });

  it("returns null on array root", () => {
    expect(parseExtractedCard("[1,2]", "f")).toBeNull();
  });

  it("falls back to truncated input when LLM omits whyRemember", () => {
    const raw = JSON.stringify({ nameZh: "陳玉涵" });
    const result = parseExtractedCard(raw, "原始輸入");
    expect(result?.whyRemember).toBe("原始輸入");
    expect(result?.nameZh).toBe("陳玉涵");
  });

  it("uses placeholder when both LLM and fallback are empty", () => {
    expect(parseExtractedCard(JSON.stringify({ nameZh: "x" }), "")?.whyRemember).toBe("（剛認識）");
  });

  it("trims and clamps long fields", () => {
    const longText = "x".repeat(2000);
    const raw = JSON.stringify({
      nameZh: `  ${longText}  `,
      whyRemember: longText,
      notes: longText,
    });
    const result = parseExtractedCard(raw, "f")!;
    expect(result.nameZh!.length).toBeLessThanOrEqual(200);
    expect(result.whyRemember!.length).toBeLessThanOrEqual(500);
    expect(result.notes!.length).toBeLessThanOrEqual(1000);
  });

  it("drops non-string fields", () => {
    const raw = JSON.stringify({ nameZh: 42, whyRemember: "valid" });
    const result = parseExtractedCard(raw, "f");
    expect(result?.nameZh).toBeUndefined();
    expect(result?.whyRemember).toBe("valid");
  });

  it("drops empty string fields (not just trims to empty)", () => {
    const raw = JSON.stringify({ nameZh: "  ", whyRemember: "x" });
    const result = parseExtractedCard(raw, "f");
    expect(result?.nameZh).toBeUndefined();
  });
});

describe("parseMultipleExtractedCards", () => {
  it("parses new {cards: [...]} schema with multiple entries", () => {
    const raw = JSON.stringify({
      cards: [
        { nameZh: "陳玉涵", whyRemember: "Computex 邊緣 AI" },
        { nameZh: "李大同", whyRemember: "Web Summit BD" },
        { nameZh: "王秘書長", whyRemember: "AI 政策" },
      ],
    });
    const result = parseMultipleExtractedCards(raw, "fallback");
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.nameZh)).toEqual(["陳玉涵", "李大同", "王秘書長"]);
  });

  it("returns single-element array for legacy {...singleCard} shape", () => {
    const raw = JSON.stringify({ nameZh: "陳玉涵", whyRemember: "x" });
    const result = parseMultipleExtractedCards(raw, "fb");
    expect(result).toHaveLength(1);
    expect(result[0]!.nameZh).toBe("陳玉涵");
  });

  it("returns [] for malformed JSON", () => {
    expect(parseMultipleExtractedCards("not json", "fb")).toEqual([]);
  });

  it("returns [] for top-level array root", () => {
    expect(parseMultipleExtractedCards("[1,2,3]", "fb")).toEqual([]);
  });

  it("drops invalid items inside cards array but keeps valid ones", () => {
    const raw = JSON.stringify({
      cards: [
        null,
        "string",
        { nameZh: "Alice", whyRemember: "x" },
        42,
        { nameZh: "Bob", whyRemember: "y" },
      ],
    });
    const result = parseMultipleExtractedCards(raw, "fb");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.nameZh)).toEqual(["Alice", "Bob"]);
  });

  it("falls back whyRemember per card when missing", () => {
    const raw = JSON.stringify({
      cards: [{ nameZh: "Alice" }, { nameZh: "Bob" }],
    });
    const result = parseMultipleExtractedCards(raw, "originals");
    expect(result[0]!.whyRemember).toBe("originals");
    expect(result[1]!.whyRemember).toBe("originals");
  });
});

describe("parseExtractedCard backward-compat through multi parser", () => {
  it("returns first card from new schema when single is requested", () => {
    const raw = JSON.stringify({
      cards: [
        { nameZh: "First", whyRemember: "x" },
        { nameZh: "Second", whyRemember: "y" },
      ],
    });
    const result = parseExtractedCard(raw, "fb");
    expect(result?.nameZh).toBe("First");
  });

  it("still parses legacy single-object payload", () => {
    const raw = JSON.stringify({ nameZh: "陳玉涵", whyRemember: "legacy" });
    const result = parseExtractedCard(raw, "fb");
    expect(result?.nameZh).toBe("陳玉涵");
  });
});

describe("encodePrefill / decodePrefill round-trip", () => {
  it("decodes what was encoded", () => {
    const original: ExtractedCard = {
      nameZh: "陳玉涵",
      companyZh: "智威",
      whyRemember: "Computex 邊緣 AI",
    };
    const encoded = encodePrefill(original);
    const decoded = decodePrefill(encoded);
    expect(decoded?.nameZh).toBe("陳玉涵");
    expect(decoded?.companyZh).toBe("智威");
    expect(decoded?.whyRemember).toBe("Computex 邊緣 AI");
  });

  it("returns null for empty / invalid encoded strings", () => {
    expect(decodePrefill("")).toBeNull();
    expect(decodePrefill(null)).toBeNull();
    expect(decodePrefill(undefined)).toBeNull();
    expect(decodePrefill("not-base64")).toBeNull();
  });

  it("returns null when payload decodes to non-object", () => {
    const encoded = Buffer.from(JSON.stringify(["array"]), "utf8").toString("base64url");
    expect(decodePrefill(encoded)).toBeNull();
  });

  it("re-sanitizes hostile decoded payloads (caps lengths, drops non-strings)", () => {
    const longText = "x".repeat(5000);
    const hostile = {
      nameZh: longText,
      jobTitleZh: 42,
      whyRemember: "valid",
    };
    const encoded = Buffer.from(JSON.stringify(hostile), "utf8").toString("base64url");
    const decoded = decodePrefill(encoded);
    expect(decoded?.nameZh!.length).toBeLessThanOrEqual(200);
    expect(decoded?.jobTitleZh).toBeUndefined();
    expect(decoded?.whyRemember).toBe("valid");
  });
});
