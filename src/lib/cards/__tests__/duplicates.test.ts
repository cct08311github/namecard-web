import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { findDuplicateGroups } from "../duplicates";

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

describe("findDuplicateGroups — email signal", () => {
  it("clusters two cards sharing one email", () => {
    const a = mk({ id: "a", emails: [{ label: "work", value: "x@y.com" }] });
    const b = mk({ id: "b", emails: [{ label: "work", value: "X@y.com " }] });
    const groups = findDuplicateGroups([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("email-match");
    expect(groups[0].cards.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("does not cluster cards with disjoint emails and different name+company", () => {
    const a = mk({ id: "a", emails: [{ label: "work", value: "a@y.com" }] });
    const b = mk({ id: "b", emails: [{ label: "work", value: "b@y.com" }] });
    expect(findDuplicateGroups([a, b])).toEqual([]);
  });
});

describe("findDuplicateGroups — name+company signal", () => {
  it("clusters cards with same name and company (case-insensitive)", () => {
    const a = mk({ id: "a", nameZh: "陳玉涵", companyZh: "ACME" });
    const b = mk({ id: "b", nameZh: "陳玉涵", companyZh: "acme" });
    const groups = findDuplicateGroups([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("name-company-match");
  });

  it("doesn't cluster on name alone (without company)", () => {
    const a = mk({ id: "a", nameZh: "陳玉涵" });
    const b = mk({ id: "b", nameZh: "陳玉涵" });
    expect(findDuplicateGroups([a, b])).toEqual([]);
  });

  it("nameEn fallback when nameZh is empty", () => {
    const a = mk({ id: "a", nameEn: "Alice Chen", companyEn: "ACME" });
    const b = mk({ id: "b", nameEn: "alice chen", companyEn: "acme" });
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
  });
});

describe("findDuplicateGroups — transitivity + reason precedence", () => {
  it("A↔B by email and B↔C by name+company puts all three together with email-match reason", () => {
    const a = mk({
      id: "a",
      nameZh: "張三",
      companyZh: "ACME",
      emails: [{ label: "work", value: "a@x.com" }],
    });
    const b = mk({
      id: "b",
      nameZh: "張三",
      companyZh: "ACME",
      emails: [{ label: "work", value: "a@x.com" }],
    });
    const c = mk({
      id: "c",
      nameZh: "張三",
      companyZh: "ACME",
    });
    const groups = findDuplicateGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].reason).toBe("email-match");
  });
});

describe("findDuplicateGroups — hygiene", () => {
  it("excludes soft-deleted cards", () => {
    const a = mk({ id: "a", emails: [{ label: "work", value: "x@y.com" }] });
    const b = mk({
      id: "b",
      emails: [{ label: "work", value: "x@y.com" }],
      deletedAt: new Date(),
    });
    expect(findDuplicateGroups([a, b])).toEqual([]);
  });

  it("returns empty array when nothing is duplicated", () => {
    expect(findDuplicateGroups([])).toEqual([]);
    expect(findDuplicateGroups([mk()])).toEqual([]);
  });

  it("sorts each group oldest-first (keep candidate first)", () => {
    const older = mk({
      id: "older",
      createdAt: new Date("2026-01-01"),
      emails: [{ label: "work", value: "x@y.com" }],
    });
    const newer = mk({
      id: "newer",
      createdAt: new Date("2026-04-01"),
      emails: [{ label: "work", value: "x@y.com" }],
    });
    const groups = findDuplicateGroups([newer, older]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("sorts groups largest-first", () => {
    // 3-member group from email "x"
    const a = mk({ id: "a", emails: [{ label: "work", value: "x@y.com" }] });
    const b = mk({ id: "b", emails: [{ label: "work", value: "x@y.com" }] });
    const c = mk({ id: "c", emails: [{ label: "work", value: "x@y.com" }] });
    // 2-member group from email "y"
    const d = mk({ id: "d", emails: [{ label: "work", value: "y@y.com" }] });
    const e = mk({ id: "e", emails: [{ label: "work", value: "y@y.com" }] });
    const groups = findDuplicateGroups([d, e, a, b, c]);
    expect(groups[0].cards).toHaveLength(3);
    expect(groups[1].cards).toHaveLength(2);
  });
});
