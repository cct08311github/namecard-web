import { describe, expect, it } from "vitest";

import { isAllowedUrlOrEmpty, safeExternalUrl } from "../url-safety";

describe("safeExternalUrl", () => {
  it("allows http: URLs", () => {
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com");
  });

  it("allows https: URLs", () => {
    expect(safeExternalUrl("https://linkedin.com/in/somebody")).toBe(
      "https://linkedin.com/in/somebody",
    );
  });

  it("allows mailto: URLs", () => {
    expect(safeExternalUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("allows tel: URLs", () => {
    expect(safeExternalUrl("tel:+886912345678")).toBe("tel:+886912345678");
  });

  it("rejects javascript: URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript: URLs", () => {
    expect(safeExternalUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects file: URLs", () => {
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeExternalUrl("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(safeExternalUrl(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(safeExternalUrl("not-a-url")).toBeNull();
  });

  it("returns null for protocol-relative URL", () => {
    expect(safeExternalUrl("//evil.com/steal")).toBeNull();
  });
});

describe("isAllowedUrlOrEmpty", () => {
  it("returns true for empty string", () => {
    expect(isAllowedUrlOrEmpty("")).toBe(true);
  });

  it("returns true for whitespace-only string", () => {
    expect(isAllowedUrlOrEmpty("   ")).toBe(true);
  });

  it("returns true for valid https URL", () => {
    expect(isAllowedUrlOrEmpty("https://example.com")).toBe(true);
  });

  it("returns false for javascript: URL", () => {
    expect(isAllowedUrlOrEmpty("javascript:alert(1)")).toBe(false);
  });

  it("returns false for data: URL", () => {
    expect(isAllowedUrlOrEmpty("data:text/html,<h1>xss</h1>")).toBe(false);
  });
});
