import { describe, expect, it } from "vitest";

import { parseSearchParams, toSearchParams } from "../url";

describe("parseSearchParams", () => {
  it("returns defaults for empty input", () => {
    expect(parseSearchParams({})).toEqual({ q: "", tag: [], tagMode: "or" });
  });

  it("trims and preserves q", () => {
    expect(parseSearchParams({ q: "  陳  " })).toMatchObject({ q: "陳" });
  });

  it("accepts tag as repeated param", () => {
    const url = new URLSearchParams();
    url.append("tag", "ai");
    url.append("tag", "biz");
    expect(parseSearchParams(url).tag).toEqual(["ai", "biz"]);
  });

  it("accepts tag as comma-separated string (legacy shareable URLs)", () => {
    expect(parseSearchParams({ tag: "ai,biz" }).tag).toEqual(["ai", "biz"]);
  });

  it("normalizes unknown tagMode to 'or'", () => {
    expect(parseSearchParams({ tagMode: "banana" }).tagMode).toBe("or");
  });

  it("accepts tagMode=and", () => {
    expect(parseSearchParams({ tagMode: "and" }).tagMode).toBe("and");
  });

  it("truncates over-long q to 200 chars", () => {
    const long = "x".repeat(500);
    expect(parseSearchParams({ q: long }).q.length).toBe(200);
  });
});

describe("toSearchParams", () => {
  it("produces an empty URLSearchParams for empty state", () => {
    expect(toSearchParams({}).toString()).toBe("");
  });

  it("omits q when blank", () => {
    expect(toSearchParams({ q: "  " }).toString()).toBe("");
  });

  it("round-trips a full state", () => {
    const sp = toSearchParams({ q: "陳", tag: ["ai", "biz"], tagMode: "and" });
    const parsed = parseSearchParams(sp);
    expect(parsed).toEqual({ q: "陳", tag: ["ai", "biz"], tagMode: "and" });
  });

  it("omits tagMode when it equals the default 'or'", () => {
    const sp = toSearchParams({ tag: ["x"], tagMode: "or" });
    expect(sp.has("tagMode")).toBe(false);
    expect(sp.getAll("tag")).toEqual(["x"]);
  });
});
