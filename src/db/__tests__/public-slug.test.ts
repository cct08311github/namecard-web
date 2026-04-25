import { describe, expect, it } from "vitest";

import { publicSlugSchema } from "../schema";

describe("publicSlugSchema", () => {
  it("accepts a typical lowercase slug", () => {
    const result = publicSlugSchema.safeParse("yu-han");
    expect(result.success).toBe(true);
  });

  it("accepts numbers and underscores", () => {
    expect(publicSlugSchema.safeParse("user_123").success).toBe(true);
    expect(publicSlugSchema.safeParse("a1b2c3").success).toBe(true);
  });

  it("accepts CJK-free slugs (intentional — slugs are URL identifiers)", () => {
    // CJK is rejected because URLs should be readable + shareable in plain ASCII
    expect(publicSlugSchema.safeParse("陳玉涵").success).toBe(false);
  });

  it("rejects slugs shorter than 3 chars", () => {
    expect(publicSlugSchema.safeParse("ab").success).toBe(false);
    expect(publicSlugSchema.safeParse("a").success).toBe(false);
  });

  it("rejects slugs longer than 30 chars", () => {
    expect(publicSlugSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects slugs with spaces or invalid chars", () => {
    expect(publicSlugSchema.safeParse("yu han").success).toBe(false);
    expect(publicSlugSchema.safeParse("yu.han").success).toBe(false);
    expect(publicSlugSchema.safeParse("yu/han").success).toBe(false);
    expect(publicSlugSchema.safeParse("YU-HAN").success).toBe(false); // uppercase
  });

  it("rejects slugs starting or ending with dash/underscore", () => {
    expect(publicSlugSchema.safeParse("-yu-han").success).toBe(false);
    expect(publicSlugSchema.safeParse("yu-han-").success).toBe(false);
    expect(publicSlugSchema.safeParse("_yuhan").success).toBe(false);
    expect(publicSlugSchema.safeParse("yuhan_").success).toBe(false);
  });

  it("accepts slug with internal dashes and underscores", () => {
    expect(publicSlugSchema.safeParse("yu-han_chen").success).toBe(true);
  });

  it("accepts at exactly the boundary lengths", () => {
    expect(publicSlugSchema.safeParse("abc").success).toBe(true); // exactly 3
    expect(publicSlugSchema.safeParse("a".repeat(30)).success).toBe(true); // exactly 30
  });
});
