import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import {
  companySlug,
  findCompanyBySlug,
  groupCardsByCompany,
  pickCanonicalCompany,
} from "../group";

function mk(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    whyRemember: "x",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("pickCanonicalCompany", () => {
  it("prefers companyZh over companyEn when both present", () => {
    const c = mk({ companyZh: "智威科技", companyEn: "ACME" });
    expect(pickCanonicalCompany(c)).toBe("智威科技");
  });

  it("falls back to companyEn when companyZh empty", () => {
    expect(pickCanonicalCompany(mk({ companyEn: "ACME" }))).toBe("ACME");
  });

  it("returns empty string when neither set", () => {
    expect(pickCanonicalCompany(mk())).toBe("");
  });

  it("trims whitespace", () => {
    expect(pickCanonicalCompany(mk({ companyEn: "  ACME  " }))).toBe("ACME");
  });
});

describe("companySlug", () => {
  it("lowercases ASCII and collapses spaces to dashes", () => {
    expect(companySlug("Acme Tech Inc")).toBe("acme-tech-inc");
  });

  it("strips punctuation but keeps CJK characters", () => {
    expect(companySlug("智威科技 (台灣)")).toBe("智威科技-台灣");
  });

  it("collapses repeated dashes and trims edge dashes", () => {
    expect(companySlug("Foo - Bar")).toBe("foo-bar");
    expect(companySlug("--Hello--")).toBe("hello");
  });

  it("normalizes slashes", () => {
    expect(companySlug("R&D / 設計部")).toBe("rd-設計部");
  });
});

describe("groupCardsByCompany", () => {
  it("clusters case/whitespace variants under one slug", () => {
    const a = mk({ id: "a", companyEn: "ACME" });
    const b = mk({ id: "b", companyEn: "acme " });
    const c = mk({ id: "c", companyEn: "Acme" });
    const groups = groupCardsByCompany([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].slug).toBe("acme");
  });

  it("excludes cards with no company name", () => {
    const noCo = mk({ id: "noCo" });
    const withCo = mk({ id: "x", companyEn: "ACME" });
    const groups = groupCardsByCompany([noCo, withCo]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((x) => x.id)).toEqual(["x"]);
  });

  it("excludes soft-deleted cards", () => {
    const live = mk({ id: "live", companyEn: "ACME" });
    const gone = mk({ id: "gone", companyEn: "ACME", deletedAt: new Date() });
    const groups = groupCardsByCompany([live, gone]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["live"]);
  });

  it("sorts cards within group by lastContactedAt desc", () => {
    const stale = mk({
      id: "stale",
      companyEn: "ACME",
      lastContactedAt: new Date("2026-01-01"),
    });
    const fresh = mk({
      id: "fresh",
      companyEn: "ACME",
      lastContactedAt: new Date("2026-04-01"),
    });
    const groups = groupCardsByCompany([stale, fresh]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["fresh", "stale"]);
  });

  it("sorts groups by most-recent-touch desc", () => {
    const oldCo = mk({
      id: "old",
      companyEn: "OldCorp",
      lastContactedAt: new Date("2026-01-01"),
    });
    const freshCo = mk({
      id: "fresh",
      companyEn: "FreshCorp",
      lastContactedAt: new Date("2026-04-01"),
    });
    const groups = groupCardsByCompany([oldCo, freshCo]);
    expect(groups.map((g) => g.displayName)).toEqual(["FreshCorp", "OldCorp"]);
  });

  it("falls back to createdAt when no lastContactedAt", () => {
    const a = mk({
      id: "a",
      companyEn: "A Co",
      createdAt: new Date("2026-04-10"),
      lastContactedAt: null,
    });
    const b = mk({
      id: "b",
      companyEn: "B Co",
      createdAt: new Date("2026-04-01"),
      lastContactedAt: null,
    });
    const groups = groupCardsByCompany([a, b]);
    expect(groups.map((g) => g.displayName)).toEqual(["A Co", "B Co"]);
  });

  it("uses the first-seen variant as displayName", () => {
    const first = mk({ id: "first", companyEn: "ACME Tech" });
    const variant = mk({ id: "variant", companyEn: "acme tech" });
    const groups = groupCardsByCompany([first, variant]);
    expect(groups[0].displayName).toBe("ACME Tech");
  });
});

describe("findCompanyBySlug", () => {
  it("returns matching group case-insensitively", () => {
    const a = mk({ id: "a", companyEn: "ACME" });
    const found = findCompanyBySlug([a], "acme");
    expect(found?.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns null when no group matches", () => {
    expect(findCompanyBySlug([], "missing")).toBeNull();
    expect(findCompanyBySlug([mk({ companyEn: "ACME" })], "other")).toBeNull();
  });
});
