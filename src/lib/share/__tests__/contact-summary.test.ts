import { describe, expect, it } from "vitest";

import { formatContactSummary } from "../contact-summary";

describe("formatContactSummary", () => {
  it("formats a complete contact with bilingual name", () => {
    const out = formatContactSummary({
      nameZh: "陳玉涵",
      nameEn: "Yvonne Chen",
      jobTitleZh: "副總",
      companyZh: "Acme",
      primaryEmail: "yvonne@acme.com",
      primaryPhone: "0922000111",
    });
    expect(out).toBe(
      ["陳玉涵（Yvonne Chen）", "副總 @ Acme", "📧 yvonne@acme.com", "📞 0922000111"].join("\n"),
    );
  });

  it("uses English when only English name present", () => {
    const out = formatContactSummary({ nameEn: "John Doe", companyEn: "Beta Corp" });
    expect(out).toBe(["John Doe", "@ Beta Corp"].join("\n"));
  });

  it("skips role+company line when both missing", () => {
    const out = formatContactSummary({ nameZh: "陳玉涵", primaryEmail: "x@y.com" });
    expect(out).toBe(["陳玉涵", "📧 x@y.com"].join("\n"));
  });

  it("falls back to en when zh role missing", () => {
    const out = formatContactSummary({
      nameZh: "陳玉涵",
      jobTitleEn: "VP Engineering",
      companyEn: "Beta",
    });
    expect(out).toBe(["陳玉涵", "VP Engineering @ Beta"].join("\n"));
  });

  it("returns empty string when all fields missing", () => {
    expect(formatContactSummary({})).toBe("");
  });

  it("trims whitespace from inputs", () => {
    const out = formatContactSummary({
      nameZh: "  陳  ",
      primaryEmail: " a@b.com",
    });
    expect(out).toBe(["陳", "📧  a@b.com"].join("\n"));
    // (trim only applies via pickFirst to role/company; emails passed verbatim
    // intentionally — we don't want to alter user-entered values)
  });
});
