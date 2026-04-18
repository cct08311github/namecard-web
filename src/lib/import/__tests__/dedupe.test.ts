import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";
import { aCard } from "@/test/fixtures";
import { detectDuplicates } from "@/lib/import/dedupe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aExistingCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: `card-${Math.random().toString(36).slice(2)}`,
    workspaceId: "wid",
    ownerUid: "uid",
    memberUids: ["uid"],
    nameZh: "張大明",
    nameEn: "David Chang",
    companyZh: "測試科技",
    companyEn: "Test Tech",
    whyRemember: "測試",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [{ label: "work", value: "david@test.example" }],
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectDuplicates", () => {
  it("returns 'none' for all rows when existing is empty", () => {
    const incoming = [
      aCard({ emails: [{ label: "work", value: "a@example.com" }] }),
      aCard({ nameEn: "Bob", companyEn: "ACME" }),
    ];
    const results = detectDuplicates(incoming, []);
    expect(results).toHaveLength(2);
    expect(results[0]!.reason).toBe("none");
    expect(results[1]!.reason).toBe("none");
  });

  it("detects email match (case-insensitive)", () => {
    const existing = aExistingCard({ emails: [{ label: "work", value: "David@Test.EXAMPLE" }] });
    const incoming = [aCard({ emails: [{ label: "work", value: "david@test.example" }] })];
    const [result] = detectDuplicates(incoming, [existing]);
    expect(result!.reason).toBe("email-match");
    expect(result!.match?.id).toBe(existing.id);
  });

  it("detects email match on the second email in the list", () => {
    const existing = aExistingCard({
      emails: [{ label: "work", value: "primary@example.com" }],
    });
    const incoming = [
      aCard({
        emails: [
          { label: "personal", value: "other@example.com" },
          { label: "work", value: "primary@example.com" },
        ],
      }),
    ];
    const [result] = detectDuplicates(incoming, [existing]);
    expect(result!.reason).toBe("email-match");
  });

  it("detects name+company composite fallback when emails are empty on both sides", () => {
    const existing = aExistingCard({
      emails: [],
      nameZh: "李小芬",
      nameEn: undefined,
      companyZh: "星際公司",
      companyEn: undefined,
    });
    const incoming = [
      aCard({
        emails: [],
        nameZh: "李小芬",
        nameEn: undefined,
        companyZh: "星際公司",
        companyEn: undefined,
        phones: [{ label: "mobile", value: "+886-900-000-001" }],
      }),
    ];
    const [result] = detectDuplicates(incoming, [existing]);
    expect(result!.reason).toBe("name-company-match");
    expect(result!.match?.id).toBe(existing.id);
  });

  it("returns 'none' when neither email nor name+company matches", () => {
    const existing = aExistingCard({
      emails: [{ label: "work", value: "notmatch@example.com" }],
      nameEn: "Someone Else",
      companyEn: "Other Corp",
    });
    const incoming = [
      aCard({
        emails: [{ label: "work", value: "unique@example.com" }],
        nameEn: "Alice Smith",
        companyEn: "Smith Inc",
      }),
    ];
    const [result] = detectDuplicates(incoming, [existing]);
    expect(result!.reason).toBe("none");
    expect(result!.match).toBeUndefined();
  });

  it("preserves input order across the result array", () => {
    const existing = aExistingCard({ emails: [{ label: "work", value: "match@example.com" }] });
    const incoming = [
      aCard({ nameEn: "First", emails: [] }),
      aCard({ emails: [{ label: "work", value: "match@example.com" }] }),
      aCard({ nameEn: "Third", emails: [] }),
    ];
    const results = detectDuplicates(incoming, [existing]);
    expect(results).toHaveLength(3);
    expect(results[0]!.reason).toBe("none");
    expect(results[1]!.reason).toBe("email-match");
    expect(results[2]!.reason).toBe("none");
    // Ensure the original row objects are the same references.
    expect(results[0]!.row).toBe(incoming[0]);
    expect(results[1]!.row).toBe(incoming[1]);
    expect(results[2]!.row).toBe(incoming[2]);
  });
});
