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

describe("toVcard contact events", () => {
  it("omits NOTE when there are no events and no other notes/why/context", () => {
    const out = toVcard(makeCard({ nameEn: "A", whyRemember: "x" }));
    // whyRemember still fills the NOTE; but there should be no 【互動紀錄】 marker.
    expect(out).not.toContain("【互動紀錄】");
  });

  it("appends 【互動紀錄】 block when events are passed", () => {
    const card = makeCard({ nameEn: "A", whyRemember: "x" });
    const out = toVcard(card, {
      events: [
        {
          id: "e1",
          at: new Date("2026-04-24T05:03:00Z"),
          note: "發了 proposal",
          authorUid: "u",
          authorDisplay: null,
        },
        {
          id: "e2",
          at: new Date("2026-04-20T07:30:00Z"),
          note: "約週末碰面",
          authorUid: "u",
          authorDisplay: null,
        },
      ],
    });
    expect(out).toContain("【互動紀錄】");
    expect(out).toContain("- 發了 proposal");
    expect(out).toContain("- 約週末碰面");
  });

  it("marks empty-note events as（無備註）", () => {
    const card = makeCard({ nameEn: "A", whyRemember: "x" });
    const out = toVcard(card, {
      events: [
        {
          id: "e",
          at: new Date("2026-04-24T00:00:00Z"),
          note: "",
          authorUid: "u",
          authorDisplay: null,
        },
      ],
    });
    expect(out).toContain("（無備註）");
  });

  it("caps at eventLimit (default 10)", () => {
    const card = makeCard({ nameEn: "A", whyRemember: "x" });
    const events = Array.from({ length: 15 }, (_, i) => ({
      id: `e${i}`,
      at: new Date(`2026-04-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      // short tokens so RFC 6350 line-fold doesn't split them mid-match
      note: `n${i}z`,
      authorUid: "u",
      authorDisplay: null,
    }));
    const out = toVcard(card, { events });
    // Strip fold breaks so tokens that straddle a 75-char boundary are
    // still findable by contain().
    const unfolded = out.replace(/\r\n /g, "");
    // Only the first 10 should appear; n0z..n9z yes, n10z..n14z no.
    for (let i = 0; i < 10; i++) expect(unfolded).toContain(`n${i}z`);
    for (let i = 10; i < 15; i++) expect(unfolded).not.toContain(`n${i}z`);
  });

  it("respects a custom eventLimit", () => {
    const card = makeCard({ nameEn: "A", whyRemember: "x" });
    const events = [
      { id: "a", at: new Date(), note: "a", authorUid: "u", authorDisplay: null },
      { id: "b", at: new Date(), note: "b", authorUid: "u", authorDisplay: null },
      { id: "c", at: new Date(), note: "c", authorUid: "u", authorDisplay: null },
    ];
    const out = toVcard(card, { events, eventLimit: 2 });
    expect(out).toContain("- a");
    expect(out).toContain("- b");
    expect(out).not.toContain("- c");
  });

  it("orders NOTE sections as: whyRemember → context → notes → events", () => {
    const card = makeCard({
      nameEn: "A",
      whyRemember: "WHY",
      firstMetContext: "CTX",
      notes: "NOTES",
    });
    const out = toVcard(card, {
      events: [{ id: "e", at: new Date(), note: "EV", authorUid: "u", authorDisplay: null }],
    });
    const whyIdx = out.indexOf("WHY");
    const ctxIdx = out.indexOf("CTX");
    const notesIdx = out.indexOf("NOTES");
    const evIdx = out.indexOf("【互動紀錄】");
    expect(whyIdx).toBeGreaterThan(0);
    expect(ctxIdx).toBeGreaterThan(whyIdx);
    expect(notesIdx).toBeGreaterThan(ctxIdx);
    expect(evIdx).toBeGreaterThan(notesIdx);
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

describe("multi-card vcard concatenation", () => {
  it("N concatenated cards yield exactly N BEGIN:VCARD blocks", () => {
    const cards = [
      makeCard({ nameZh: "陳玉涵", whyRemember: "first" }),
      makeCard({ nameZh: "王小明", whyRemember: "second" }),
      makeCard({ nameZh: "李大同", whyRemember: "third" }),
    ];
    const body = cards.map((c) => toVcard(c)).join("");
    const beginCount = body.match(/BEGIN:VCARD/g)?.length ?? 0;
    const endCount = body.match(/END:VCARD/g)?.length ?? 0;
    expect(beginCount).toBe(3);
    expect(endCount).toBe(3);
    expect(body).toContain("first");
    expect(body).toContain("second");
    expect(body).toContain("third");
  });

  it("concatenated cards each end with CRLF so the next BEGIN is on a fresh line", () => {
    const a = toVcard(makeCard({ nameZh: "A", whyRemember: "x" }));
    const b = toVcard(makeCard({ nameZh: "B", whyRemember: "y" }));
    expect(a.endsWith("\r\n")).toBe(true);
    // After joining, the boundary is "END:VCARD\r\nBEGIN:VCARD" — no
    // missing CRLF and no doubled blank line.
    const combined = a + b;
    expect(combined).toContain("END:VCARD\r\nBEGIN:VCARD");
  });

  it("each block stays self-contained (FN field unique to that card)", () => {
    const cards = [
      makeCard({ nameZh: "First", whyRemember: "x" }),
      makeCard({ nameZh: "Second", whyRemember: "y" }),
    ];
    const body = cards.map((c) => toVcard(c)).join("");
    // FN: lines should appear exactly once per card.
    expect(body.match(/FN:First/g)?.length).toBe(1);
    expect(body.match(/FN:Second/g)?.length).toBe(1);
  });
});
