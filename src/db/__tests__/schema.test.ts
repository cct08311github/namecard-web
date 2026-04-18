import { describe, it, expect } from "vitest";

import { cardCreateSchema, cardDocSchema, tagCreateSchema, workspaceDocSchema } from "../schema";

describe("cardCreateSchema", () => {
  it("accepts a minimal valid card (name + whyRemember)", () => {
    const result = cardCreateSchema.safeParse({
      nameZh: "陳志明",
      whyRemember: "2024 COMPUTEX 攤位聊到邊緣 AI 推論。",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a card without name, email, or phone", () => {
    const result = cardCreateSchema.safeParse({
      whyRemember: "聊了很久但忘記名字。",
    });
    expect(result.success).toBe(false);
  });

  it("requires whyRemember", () => {
    const result = cardCreateSchema.safeParse({
      nameZh: "陳志明",
    });
    expect(result.success).toBe(false);
  });

  it("enforces whyRemember max length", () => {
    const result = cardCreateSchema.safeParse({
      nameZh: "陳志明",
      whyRemember: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format in emails array", () => {
    const result = cardCreateSchema.safeParse({
      nameEn: "Alice",
      whyRemember: "介紹人。",
      emails: [{ label: "work", value: "not-an-email" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid email + phone combination", () => {
    const result = cardCreateSchema.safeParse({
      whyRemember: "Booth partner.",
      emails: [{ label: "work", value: "alice@example.com", primary: true }],
      phones: [{ label: "mobile", value: "+886-912345678" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects firstMetDate that is not YYYY-MM-DD", () => {
    const result = cardCreateSchema.safeParse({
      nameEn: "Alice",
      whyRemember: "Met at WebSummit.",
      firstMetDate: "2024/01/01",
    });
    expect(result.success).toBe(false);
  });

  it("caps tagIds and tagNames arrays", () => {
    const many = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    const result = cardCreateSchema.safeParse({
      nameEn: "Alice",
      whyRemember: "Met at WebSummit.",
      tagIds: many,
    });
    expect(result.success).toBe(false);
  });
});

describe("cardDocSchema", () => {
  it("requires memberUids non-empty", () => {
    const result = cardDocSchema.safeParse({
      id: "abc",
      workspaceId: "u1",
      ownerUid: "u1",
      memberUids: [],
      nameEn: "Alice",
      whyRemember: "x",
      phones: [],
      emails: [],
      addresses: [],
      social: {},
      tagIds: [],
      tagNames: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("tagCreateSchema", () => {
  it("accepts tag with optional color", () => {
    expect(tagCreateSchema.safeParse({ name: "AI" }).success).toBe(true);
    expect(tagCreateSchema.safeParse({ name: "AI", color: "oklch(55% 0.18 30)" }).success).toBe(
      true,
    );
  });

  it("rejects empty name", () => {
    expect(tagCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("workspaceDocSchema", () => {
  it("accepts personal workspace (single-member)", () => {
    const result = workspaceDocSchema.safeParse({
      id: "uid-1",
      name: "Personal",
      ownerUid: "uid-1",
      memberUids: ["uid-1"],
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});
