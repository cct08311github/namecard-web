import { describe, it, expect } from "vitest";
import {
  vcardToCardCreateInput,
  normalizePhone,
  normalizeEmail,
  InvalidMappedCardError,
} from "../mapper";
import type { ParsedVcard } from "@/lib/vcard/parse";

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
