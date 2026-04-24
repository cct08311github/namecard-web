import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { toVcard, vcardFilename } from "../export";

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-1",
    workspaceId: "u1",
    ownerUid: "u1",
    memberUids: ["u1"],
    nameZh: "",
    nameEn: "",
    companyZh: "",
    companyEn: "",
    jobTitleZh: "",
    jobTitleEn: "",
    whyRemember: "",
    firstMetDate: undefined,
    firstMetContext: undefined,
    firstMetEventTag: undefined,
    notes: undefined,
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    frontImagePath: undefined,
    backImagePath: undefined,
    isPinned: false,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("toVcard", () => {
  it("emits BEGIN/END/VERSION", () => {
    const out = toVcard(makeCard({ nameZh: "陳志明", whyRemember: "test" }));
    expect(out).toMatch(/^BEGIN:VCARD\r\n/);
    expect(out).toMatch(/VERSION:4\.0\r\n/);
    expect(out).toMatch(/END:VCARD\r\n$/);
  });

  it("uses nameZh as FN when provided", () => {
    const out = toVcard(makeCard({ nameZh: "陳志明", whyRemember: "x" }));
    expect(out).toContain("FN:陳志明");
  });

  it("falls back to company when no name", () => {
    const out = toVcard(makeCard({ companyEn: "ACME Corp", whyRemember: "x" }));
    expect(out).toContain("FN:ACME Corp");
  });

  it("splits English N into family/given", () => {
    const out = toVcard(makeCard({ nameEn: "Alice Chen", whyRemember: "x" }));
    expect(out).toContain("N:Chen;Alice;;;");
  });

  it("escapes commas, semicolons, newlines, backslashes", () => {
    const out = toVcard(
      makeCard({
        nameZh: "王; 小明, 測試\\反斜線",
        whyRemember: "line1\nline2",
      }),
    );
    expect(out).toContain("FN:王\\; 小明\\, 測試\\\\反斜線");
    expect(out).toContain("NOTE:【為什麼記得】line1\\nline2");
  });

  it("emits TEL with mobile type for phone label=mobile", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        phones: [{ label: "mobile", value: "+886-912345678", primary: true }],
      }),
    );
    expect(out).toContain("TEL;TYPE=cell,pref:+886-912345678");
  });

  it("maps each phone label to the correct TEL type", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        phones: [
          { label: "office", value: "1" },
          { label: "home", value: "2" },
          { label: "fax", value: "3" },
          { label: "other", value: "4" },
        ],
      }),
    );
    expect(out).toContain("TEL;TYPE=work,voice:1");
    expect(out).toContain("TEL;TYPE=home,voice:2");
    expect(out).toContain("TEL;TYPE=work,fax:3");
    expect(out).toContain("TEL;TYPE=voice:4");
  });

  it("maps each email label to the correct EMAIL type", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        emails: [
          { label: "work", value: "w@ex.com" },
          { label: "personal", value: "p@ex.com" },
          { label: "other", value: "o@ex.com" },
        ],
      }),
    );
    expect(out).toContain("EMAIL;TYPE=work:w@ex.com");
    expect(out).toContain("EMAIL;TYPE=home:p@ex.com");
    expect(out).toContain("EMAIL;TYPE=internet:o@ex.com");
  });

  it("skips phones/emails with empty value", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        phones: [{ label: "mobile", value: "" }],
        emails: [{ label: "work", value: "" }],
      }),
    );
    expect(out).not.toContain("TEL;TYPE=cell");
    expect(out).not.toContain("EMAIL;TYPE=work");
  });

  it("emits URL lines when social has linkedinUrl / websiteUrl", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        social: {
          linkedinUrl: "https://linkedin.com/in/alice",
          websiteUrl: "https://alice.dev",
        },
      }),
    );
    expect(out).toContain("URL;TYPE=linkedin:https://linkedin.com/in/alice");
    expect(out).toContain("URL;TYPE=website:https://alice.dev");
  });

  it("emits CATEGORIES when firstMetEventTag is set", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        firstMetEventTag: "COMPUTEX 2024",
      }),
    );
    expect(out).toContain("CATEGORIES:COMPUTEX 2024");
  });

  it("emits ORG with department suffix when department is set", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        companyEn: "ACME",
        department: "Research",
      }),
    );
    expect(out).toContain("ORG:ACME;Research");
  });

  it("folds long lines per RFC 6350 (>75 chars)", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x".repeat(200),
      }),
    );
    // Folded continuation lines start with a single space.
    expect(out).toMatch(/\r\n [^\r\n]/);
  });

  it("uses company fallback for N when nameEn and nameZh are empty", () => {
    const out = toVcard(
      makeCard({
        whyRemember: "x",
        companyEn: "ACME",
      }),
    );
    // N family/given should be empty (no real person name available).
    expect(out).toContain("N:;;;;");
  });

  it("splits single-token English name as givenName only", () => {
    const out = toVcard(makeCard({ nameEn: "Mononym", whyRemember: "x" }));
    expect(out).toContain("N:;Mononym;;;");
  });

  it("includes notes verbatim when both whyRemember and notes set", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "record A",
        notes: "additional free-form note",
      }),
    );
    expect(out).toContain("【為什麼記得】record A");
    expect(out).toContain("additional free-form note");
  });

  it("prefixes NOTE with 為什麼記得 and 場合", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "布展很忙還聊了 30 分鐘",
        firstMetContext: "2024 COMPUTEX Keynote 後",
      }),
    );
    expect(out).toContain("NOTE:【為什麼記得】布展很忙還聊了 30 分鐘");
    expect(out).toContain("【場合】2024 COMPUTEX Keynote 後");
  });

  it("uses CRLF line endings (RFC 6350)", () => {
    const out = toVcard(makeCard({ nameEn: "Alice", whyRemember: "x" }));
    expect(out.split("\r\n").length).toBeGreaterThan(3);
  });

  it("emits X-FIRST-MET when firstMetDate is set", () => {
    const out = toVcard(
      makeCard({
        nameEn: "Alice",
        whyRemember: "x",
        firstMetDate: "2024-06-04",
      }),
    );
    expect(out).toContain("X-FIRST-MET;VALUE=date:20240604");
  });
});

describe("vcardFilename", () => {
  it("uses nameEn when available", () => {
    const filename = vcardFilename(makeCard({ nameEn: "Alice Chen", whyRemember: "x" }));
    expect(filename).toBe("Alice_Chen.vcf");
  });

  it("falls back to contact.vcf when blank", () => {
    const filename = vcardFilename(makeCard({ whyRemember: "x" }));
    expect(filename).toBe("contact.vcf");
  });

  it("strips filesystem-unsafe chars", () => {
    const filename = vcardFilename(makeCard({ nameEn: "A<B/C:D|E*?", whyRemember: "x" }));
    expect(filename).toMatch(/^[A-Za-z0-9_\-]+\.vcf$/);
  });
});
