import { describe, expect, it } from "vitest";

import type { CardSummary, ContactEvent } from "@/db/cards";

import {
  buildReengageMessages,
  buildReengagePrompt,
  isEmptyReengage,
  parseReengageResponse,
  reengageCacheKey,
  type ReengageContext,
} from "../reengage";

const NOW = new Date("2026-04-25T10:00:00Z");

function mkCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-1",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "陳玉涵",
    nameEn: "Yu-Han",
    jobTitleZh: "PM",
    companyZh: "智威",
    whyRemember: "Computex 邊緣 AI",
    firstMetEventTag: "2024 COMPUTEX",
    firstMetDate: "2024-06-04",
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
    ...overrides,
  };
}

function mkEvent(overrides: Partial<ContactEvent> = {}): ContactEvent {
  return {
    id: "ev-1",
    at: new Date("2025-09-01"),
    note: "",
    authorUid: "u",
    authorDisplay: null,
    ...overrides,
  };
}

function mkCtx(overrides: Partial<ReengageContext> = {}): ReengageContext {
  return {
    card: mkCard(),
    recentEvents: [],
    now: NOW,
    ...overrides,
  };
}

describe("buildReengagePrompt", () => {
  it("includes name + role + company + whyRemember", () => {
    const prompt = buildReengagePrompt(mkCtx());
    expect(prompt).toContain("陳玉涵");
    expect(prompt).toContain("PM");
    expect(prompt).toContain("智威");
    expect(prompt).toContain("Computex 邊緣 AI");
  });

  it("computes days-since-contact", () => {
    const prompt = buildReengagePrompt(mkCtx());
    // 2026-04-25 - 2025-09-01 ≈ 236 days
    expect(prompt).toMatch(/距上次互動：\d+ 天/);
  });

  it("flags 'no contact yet' when lastContactedAt is null", () => {
    const prompt = buildReengagePrompt(mkCtx({ card: mkCard({ lastContactedAt: null }) }));
    expect(prompt).toContain("尚未有任何互動紀錄");
  });

  it("includes recent contact event notes", () => {
    const ctx = mkCtx({
      recentEvents: [mkEvent({ note: "視訊聊新方案", at: new Date("2026-04-01") })],
    });
    const prompt = buildReengagePrompt(ctx);
    expect(prompt).toContain("近期互動歷史");
    expect(prompt).toContain("2026-04-01");
    expect(prompt).toContain("視訊聊新方案");
  });
});

describe("buildReengageMessages", () => {
  it("returns system + user, system specifies 3-bucket schema", () => {
    const msgs = buildReengageMessages(mkCtx());
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toContain("shortMessage");
    expect(msgs[0]!.content).toContain("email");
    expect(msgs[0]!.content).toContain("casualPing");
  });
});

describe("parseReengageResponse", () => {
  it("parses a clean JSON response", () => {
    const raw = JSON.stringify({
      shortMessage: "Hi 陳玉涵！最近怎樣？",
      email: { subject: "問候 + 一個想法", body: "親愛的玉涵...\n\n保持聯絡 :)" },
      casualPing: "剛剛看到 NVIDIA 新晶片，想到你。",
    });
    const result = parseReengageResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.shortMessage).toBe("Hi 陳玉涵！最近怎樣？");
    expect(result!.email.subject).toBe("問候 + 一個想法");
    expect(result!.casualPing).toContain("NVIDIA");
  });

  it("strips markdown json fence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        shortMessage: "hi",
        email: { subject: "x", body: "y" },
        casualPing: "z",
      }) +
      "\n```";
    const result = parseReengageResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.shortMessage).toBe("hi");
  });

  it("returns null on malformed JSON", () => {
    expect(parseReengageResponse("not json")).toBeNull();
  });

  it("returns null on non-object root", () => {
    expect(parseReengageResponse("[1,2]")).toBeNull();
  });

  it("returns null when all fields are empty / missing", () => {
    expect(parseReengageResponse(JSON.stringify({}))).toBeNull();
  });

  it("survives partial response (just shortMessage)", () => {
    const result = parseReengageResponse(JSON.stringify({ shortMessage: "hi" }));
    expect(result).not.toBeNull();
    expect(result!.shortMessage).toBe("hi");
    expect(result!.email.subject).toBe("");
    expect(result!.casualPing).toBe("");
  });

  it("trims whitespace and respects max lengths", () => {
    const longText = "x".repeat(2000);
    const result = parseReengageResponse(
      JSON.stringify({
        shortMessage: `  ${longText}  `,
        email: { subject: longText, body: longText },
        casualPing: "valid",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.shortMessage.length).toBeLessThanOrEqual(280);
    expect(result!.email.subject.length).toBeLessThanOrEqual(120);
    expect(result!.email.body.length).toBeLessThanOrEqual(1200);
  });
});

describe("isEmptyReengage", () => {
  it("true for null", () => {
    expect(isEmptyReengage(null)).toBe(true);
  });

  it("true when all fields are empty", () => {
    expect(
      isEmptyReengage({
        shortMessage: "",
        email: { subject: "", body: "" },
        casualPing: "",
      }),
    ).toBe(true);
  });

  it("false when any field has content", () => {
    expect(
      isEmptyReengage({
        shortMessage: "x",
        email: { subject: "", body: "" },
        casualPing: "",
      }),
    ).toBe(false);
  });
});

describe("reengageCacheKey", () => {
  it("is stable for identical context", () => {
    expect(reengageCacheKey(mkCtx())).toBe(reengageCacheKey(mkCtx()));
  });

  it("changes when whyRemember changes", () => {
    const a = reengageCacheKey(mkCtx());
    const b = reengageCacheKey(mkCtx({ card: mkCard({ whyRemember: "different" }) }));
    expect(a).not.toBe(b);
  });

  it("stays in the same bucket within a 14-day window", () => {
    // both within "0-14d" bucket
    const a = reengageCacheKey(
      mkCtx({
        card: mkCard({ lastContactedAt: new Date("2026-04-25T00:00:00Z") }),
      }),
    );
    const b = reengageCacheKey(
      mkCtx({
        card: mkCard({ lastContactedAt: new Date("2026-04-12T00:00:00Z") }),
      }),
    );
    expect(a).toBe(b);
  });

  it("changes when crossing a bucket boundary", () => {
    // 5 days vs 60 days = different buckets
    const a = reengageCacheKey(
      mkCtx({ card: mkCard({ lastContactedAt: new Date("2026-04-20") }) }),
    );
    const b = reengageCacheKey(
      mkCtx({ card: mkCard({ lastContactedAt: new Date("2026-02-25") }) }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when a new contact event note appears", () => {
    const a = reengageCacheKey(mkCtx());
    const b = reengageCacheKey(mkCtx({ recentEvents: [mkEvent({ note: "fresh meeting" })] }));
    expect(a).not.toBe(b);
  });
});
