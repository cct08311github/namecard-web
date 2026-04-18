import { describe, expect, it } from "vitest";

import { CARDS_QUERY_BY_FIELDS, CARDS_QUERY_BY_WEIGHTS } from "../schema";
import { buildSearchParams } from "../query";

describe("buildSearchParams", () => {
  const uid = "uid-alice";

  it("always scopes filter_by to the caller's uid via memberUids", () => {
    const p = buildSearchParams({ q: "", memberUid: uid });
    expect(p.filter_by).toContain(`memberUids:=${uid}`);
  });

  it("empty query becomes '*' so Typesense returns all matches", () => {
    const p = buildSearchParams({ q: "   ", memberUid: uid });
    expect(p.q).toBe("*");
  });

  it("query_by + query_by_weights are aligned 1:1", () => {
    const p = buildSearchParams({ q: "陳", memberUid: uid });
    const fields = p.query_by.split(",");
    const weights = p.query_by_weights.split(",").map(Number);
    expect(fields.length).toBe(weights.length);
    expect(fields).toEqual(CARDS_QUERY_BY_FIELDS);
    expect(weights).toEqual(CARDS_QUERY_BY_FIELDS.map((f) => CARDS_QUERY_BY_WEIGHTS[f]));
  });

  it("sort_by puts text match first, then recency", () => {
    const p = buildSearchParams({ q: "x", memberUid: uid });
    expect(p.sort_by).toBe("_text_match:desc,lastContactedAt:desc,createdAt:desc");
  });

  it("OR mode produces a single bracketed tagIds filter", () => {
    const p = buildSearchParams({
      q: "",
      memberUid: uid,
      tagIds: ["t-a", "t-b"],
      tagMode: "or",
    });
    expect(p.filter_by).toContain("tagIds:=[t-a,t-b]");
  });

  it("AND mode produces one filter clause per tag, joined by &&", () => {
    const p = buildSearchParams({
      q: "",
      memberUid: uid,
      tagIds: ["t-a", "t-b"],
      tagMode: "and",
    });
    expect(p.filter_by).toContain("tagIds:=t-a");
    expect(p.filter_by).toContain("tagIds:=t-b");
    expect(p.filter_by).not.toContain("tagIds:=[t-a,t-b]");
  });

  it("backtick-escapes special chars in ids (spaces, CJK)", () => {
    const p = buildSearchParams({
      q: "",
      memberUid: "uid with space",
    });
    expect(p.filter_by).toContain("`uid with space`");
  });

  it("clamps limit and paginates via offset", () => {
    const p = buildSearchParams({ q: "x", memberUid: uid, limit: 500, offset: 60 });
    expect(p.per_page).toBe(100);
    expect(p.page).toBe(Math.floor(60 / 100) + 1);
  });

  it("allows 1 typo so 陳 near-misses still rank", () => {
    const p = buildSearchParams({ q: "x", memberUid: uid });
    expect(p.num_typos).toBe(1);
  });
});
