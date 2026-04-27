import { describe, expect, it } from "vitest";

import { sanitizePhoneForTelHref } from "../phone";

describe("sanitizePhoneForTelHref", () => {
  it("removes spaces from a formatted US number with leading +", () => {
    expect(sanitizePhoneForTelHref("+1 (800) 123-4567")).toBe("+18001234567");
  });

  it("removes dashes from a Taiwan mobile number", () => {
    expect(sanitizePhoneForTelHref("0912-345-678")).toBe("0912345678");
  });

  it("strips spaces from a Taiwan country-code number", () => {
    expect(sanitizePhoneForTelHref("+886 912 345 678")).toBe("+886912345678");
  });

  it("returns a plain digit string unchanged", () => {
    expect(sanitizePhoneForTelHref("09123456789")).toBe("09123456789");
  });

  it("returns a +country-code string with no separators unchanged", () => {
    expect(sanitizePhoneForTelHref("+886912345678")).toBe("+886912345678");
  });

  it("strips parentheses and dots", () => {
    expect(sanitizePhoneForTelHref("(02) 2345.6789")).toBe("0223456789");
  });

  it("handles an empty string", () => {
    expect(sanitizePhoneForTelHref("")).toBe("");
  });

  it("preserves leading + even with surrounding whitespace", () => {
    expect(sanitizePhoneForTelHref("  +1 800 123 4567  ")).toBe("+18001234567");
  });

  it("does not add + when the only + is in the middle", () => {
    // A malformed value — no leading +, just digits and a stray +
    expect(sanitizePhoneForTelHref("123+456")).toBe("123456");
  });
});
