import { describe, expect, it } from "vitest";

import {
  CARDS_COLLECTION_NAME,
  CARDS_QUERY_BY_FIELDS,
  CARDS_QUERY_BY_WEIGHTS,
  cardsCollectionSchema,
} from "../schema";

/**
 * Lock the shape of the Typesense schema — any silent field rename
 * (e.g. dropping `locale: "zh"` from a CJK field, losing the
 * memberUids facet, or skewing query_by alignment) breaks acceptance
 * criteria 中文「陳」命中「陳志明」 + cross-workspace isolation.
 */
describe("cards collection schema", () => {
  it("is named 'cards'", () => {
    expect(cardsCollectionSchema.name).toBe(CARDS_COLLECTION_NAME);
    expect(CARDS_COLLECTION_NAME).toBe("cards");
  });

  it("tokens split on card-specific separators but not CJK", () => {
    expect(cardsCollectionSchema.token_separators).toEqual(["-", "_", "@", ".", "/"]);
  });

  it("every CJK-bearing text field declares locale: 'zh'", () => {
    const cjkFields = ["nameZh", "companyZh", "jobTitleZh", "whyRemember", "notes", "tagNames"];
    for (const name of cjkFields) {
      const field = cardsCollectionSchema.fields?.find((f) => f.name === name);
      expect(field, `field ${name} must exist`).toBeDefined();
      expect(field?.locale, `field ${name} must declare locale: zh`).toBe("zh");
    }
  });

  it("English-only fields do NOT declare a locale", () => {
    const enFields = ["nameEn", "companyEn", "jobTitleEn"];
    for (const name of enFields) {
      const field = cardsCollectionSchema.fields?.find((f) => f.name === name);
      expect(field?.locale).toBeUndefined();
    }
  });

  it("memberUids is indexed as a facet for workspace isolation", () => {
    const field = cardsCollectionSchema.fields?.find((f) => f.name === "memberUids");
    expect(field).toMatchObject({ type: "string[]", facet: true });
  });

  it("tag fields are facets so filter_by tagIds works", () => {
    const tagIds = cardsCollectionSchema.fields?.find((f) => f.name === "tagIds");
    const tagNames = cardsCollectionSchema.fields?.find((f) => f.name === "tagNames");
    expect(tagIds?.facet).toBe(true);
    expect(tagNames?.facet).toBe(true);
  });

  it("ranking signal lastContactedAt is int64 and optional", () => {
    const field = cardsCollectionSchema.fields?.find((f) => f.name === "lastContactedAt");
    expect(field).toMatchObject({ type: "int64", optional: true });
  });

  it("query_by fields align 1:1 with weights", () => {
    const weightKeys = Object.keys(CARDS_QUERY_BY_WEIGHTS).sort();
    const fieldList = [...CARDS_QUERY_BY_FIELDS].sort();
    expect(fieldList).toEqual(weightKeys);
  });

  it("name fields outrank company, company outranks tags, tags outrank content", () => {
    const w = CARDS_QUERY_BY_WEIGHTS;
    expect(w.nameZh).toBeGreaterThan(w.companyZh);
    expect(w.nameEn).toBeGreaterThan(w.companyEn);
    expect(w.companyZh).toBeGreaterThan(w.tagNames);
    expect(w.tagNames).toBeGreaterThan(w.whyRemember);
    expect(w.tagNames).toBeGreaterThan(w.notes);
  });

  it("declares createdAt as default_sorting_field so responses are stable without explicit sort", () => {
    expect(cardsCollectionSchema.default_sorting_field).toBe("createdAt");
  });
});
