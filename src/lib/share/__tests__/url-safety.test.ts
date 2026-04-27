import { describe, it, expect } from "vitest";

import { isAllowedUrlOrEmpty, safeExternalUrl } from "../url-safety";

describe("safeExternalUrl", () => {
  it("allows https URLs", () => {
    expect(safeExternalUrl("https://example.com")).toBe("https://example.com");
  });

  it("allows http URLs", () => {
    expect(safeExternalUrl("http://example.com/path?q=1")).toBe("http://example.com/path?q=1");
  });

  it("allows mailto URLs", () => {
    expect(safeExternalUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("allows tel URLs", () => {
    expect(safeExternalUrl("tel:+886912345678")).toBe("tel:+886912345678");
  });

  it("rejects javascript: scheme", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects javascript: with mixed case", () => {
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("rejects data: scheme", () => {
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript: scheme", () => {
    expect(safeExternalUrl("vbscript:MsgBox(1)")).toBeNull();
  });

  it("returns null for unparseable value", () => {
    expect(safeExternalUrl("not a url at all")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(safeExternalUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeExternalUrl("")).toBeNull();
  });
});

describe("isAllowedUrlOrEmpty", () => {
  it("returns true for undefined (optional field)", () => {
    expect(isAllowedUrlOrEmpty(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isAllowedUrlOrEmpty("")).toBe(true);
  });

  it("returns true for a safe https URL", () => {
    expect(isAllowedUrlOrEmpty("https://linkedin.com/in/someone")).toBe(true);
  });

  it("returns false for javascript: scheme", () => {
    expect(isAllowedUrlOrEmpty("javascript:alert(1)")).toBe(false);
  });

  it("returns false for data: scheme", () => {
    expect(isAllowedUrlOrEmpty("data:image/svg+xml,<svg/>")).toBe(false);
  });
});
