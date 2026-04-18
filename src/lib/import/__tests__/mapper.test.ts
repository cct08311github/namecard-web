import { describe, it, expect } from "vitest";
import {
  vcardToCardCreateInput,
  csvRowToCardCreateInput,
  normalizePhone,
  normalizeEmail,
  InvalidMappedCardError,
} from "../mapper";
import type { ParsedVcard } from "@/lib/vcard/parse";
import type { CanonicalCardField } from "@/lib/csv/linkedin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVcard(overrides: Partial<ParsedVcard> = {}): ParsedVcard {
  return {
    phones: [],
    emails: [],
    categories: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("vcardToCardCreateInput", () => {
  it("1. pure English FN → nameEn, nameZh empty", () => {
    const result = vcardToCardCreateInput(makeVcard({ fn: "John Smith" }));
    expect(result.nameEn).toBe("John Smith");
    expect(result.nameZh).toBeUndefined();
  });

  it("2. Chinese FN → nameZh", () => {
    const result = vcardToCardCreateInput(makeVcard({ fn: "陳志明" }));
    expect(result.nameZh).toBe("陳志明");
    expect(result.nameEn).toBeUndefined();
  });

  it("3. CJK nFamily+nGiven → nameZh", () => {
    const result = vcardToCardCreateInput(makeVcard({ nFamily: "陳", nGiven: "志明" }));
    expect(result.nameZh).toBe("陳志明");
  });

  it("4. Western nFamily+nGiven → nameEn (given family order)", () => {
    const result = vcardToCardCreateInput(makeVcard({ nFamily: "Chen", nGiven: "Alex" }));
    expect(result.nameEn).toBe("Alex Chen");
  });

  it("5. default whyRemember is '來自 vCard 匯入'", () => {
    const result = vcardToCardCreateInput(
      makeVcard({ phones: [{ label: "mobile", value: "+1-555-0001" }] }),
    );
    expect(result.whyRemember).toBe("來自 vCard 匯入");
  });

  it("6. categories map to tagNames, tagIds is empty", () => {
    const result = vcardToCardCreateInput(
      makeVcard({
        fn: "Cat Person",
        categories: ["Conference 2024", "Investor"],
      }),
    );
    expect(result.tagNames).toEqual(["Conference 2024", "Investor"]);
    expect(result.tagIds).toEqual([]);
  });

  it("7. phone label inference: cell→mobile, work→office, home→home, fax→fax", () => {
    const result = vcardToCardCreateInput(
      makeVcard({
        fn: "Multi Phone",
        phones: [
          { label: "mobile", value: "+1-555-0001" },
          { label: "office", value: "+1-555-0002" },
          { label: "home", value: "+1-555-0003" },
          { label: "fax", value: "+1-555-0004" },
        ],
      }),
    );
    const labels = result.phones.map((p) => p.label);
    expect(labels).toEqual(["mobile", "office", "home", "fax"]);
  });

  it("8. email dedupe by value keeps first occurrence label", () => {
    const result = vcardToCardCreateInput(
      makeVcard({
        fn: "Dedup Person",
        emails: [
          { label: "work", value: "same@example.com" },
          { label: "personal", value: "same@example.com" },
          { label: "other", value: "other@example.com" },
        ],
      }),
    );
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0].value).toBe("same@example.com");
    expect(result.emails[0].label).toBe("work");
    expect(result.emails[1].value).toBe("other@example.com");
  });

  it("9. invalid output throws InvalidMappedCardError (nameZh too long)", () => {
    expect(() =>
      vcardToCardCreateInput(
        makeVcard({
          // nameZh is max 100 chars per schema
          fn: "A".repeat(200),
        }),
      ),
    ).toThrow(InvalidMappedCardError);
  });

  it("10. normalizePhone preserves +886-912-345-678 format, strips parens/spaces", () => {
    expect(normalizePhone("+886-912-345-678")).toBe("+886-912-345-678");
    expect(normalizePhone("(02) 2345-6789")).toBe("02 2345-6789");
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+1 555 123-4567");
    expect(normalizePhone("  +49 30 1234567  ")).toBe("+49 30 1234567");
  });

  it("11. normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  USER@EXAMPLE.COM  ")).toBe("user@example.com");
    expect(normalizeEmail("Alice+Tag@Gmail.COM")).toBe("alice+tag@gmail.com");
  });
});

describe("normalizePhone", () => {
  it("removes brackets but keeps dashes and plus", () => {
    expect(normalizePhone("+886(0)912-345-678")).toBe("+8860912-345-678");
  });

  it("collapses multiple spaces", () => {
    expect(normalizePhone("+1  555  0001")).toBe("+1 555 0001");
  });
});

describe("normalizeEmail", () => {
  it("handles already normalized input", () => {
    expect(normalizeEmail("test@example.com")).toBe("test@example.com");
  });
});

// ---------------------------------------------------------------------------
// csvRowToCardCreateInput
// ---------------------------------------------------------------------------

describe("csvRowToCardCreateInput", () => {
  const linkedInHeaders = [
    "First Name",
    "Last Name",
    "Email Address",
    "Company",
    "Position",
    "Connected On",
  ];

  const linkedInMapping: Record<string, CanonicalCardField> = {
    "First Name": "firstName",
    "Last Name": "lastName",
    "Email Address": "emailWork",
    Company: "companyEn",
    Position: "jobTitleEn",
    "Connected On": "firstMetDate",
  };

  it("1. LinkedIn row → nameEn joined, emailWork mapped", () => {
    const row = ["Alice", "Chen", "alice@example.com", "Acme Corp", "Engineer", "15 Apr 2024"];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.nameEn).toBe("Alice Chen");
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toEqual({ label: "work", value: "alice@example.com" });
    expect(result.companyEn).toBe("Acme Corp");
    expect(result.jobTitleEn).toBe("Engineer");
  });

  it("2. firstMetDate parses 'DD Mon YYYY' format", () => {
    const row = ["Alice", "Chen", "alice@example.com", "", "", "15 Apr 2024"];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.firstMetDate).toBe("2024-04-15");
  });

  it("3. firstMetDate parses 'YYYY-MM-DD' format", () => {
    const row = ["Alice", "Chen", "alice@example.com", "", "", "2024-04-15"];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.firstMetDate).toBe("2024-04-15");
  });

  it("4. invalid date dropped silently (firstMetDate is undefined)", () => {
    const row = ["Alice", "Chen", "alice@example.com", "", "", "not-a-date"];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.firstMetDate).toBeUndefined();
  });

  it("5. whyRemember defaults to '來自 CSV 匯入'", () => {
    const row = ["Alice", "Chen", "alice@example.com", "", "", ""];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.whyRemember).toBe("來自 CSV 匯入");
  });

  it("6. blank cells don't pollute output (email/company/title omitted)", () => {
    const row = ["Alice", "Chen", "", "", "", ""];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.emails).toHaveLength(0);
    expect(result.companyEn).toBeUndefined();
    expect(result.jobTitleEn).toBeUndefined();
  });

  it("7. only firstName present → nameEn is just firstName", () => {
    const headers = ["First Name", "Company"];
    const mapping: Record<string, CanonicalCardField> = {
      "First Name": "firstName",
      Company: "companyEn",
    };
    const row = ["Alice", "Acme"];
    const result = csvRowToCardCreateInput(row, mapping, headers);
    expect(result.nameEn).toBe("Alice");
  });

  it("8. email is normalized (lowercased)", () => {
    const row = ["Alice", "Chen", "ALICE@EXAMPLE.COM", "", "", ""];
    const result = csvRowToCardCreateInput(row, linkedInMapping, linkedInHeaders);
    expect(result.emails[0].value).toBe("alice@example.com");
  });
});
