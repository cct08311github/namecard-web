import { describe, expect, it } from "vitest";

import { linkedInSearchUrl } from "../linkedin-search";

describe("linkedInSearchUrl", () => {
  it("combines name and company into the keywords param", () => {
    const url = linkedInSearchUrl({ name: "陳玉涵", company: "Acme Inc" });
    expect(url).toContain("linkedin.com/search/results/people/");
    expect(url).toContain("keywords=");
    expect(decodeURIComponent(url!).replace(/\+/g, " ")).toContain("陳玉涵 Acme Inc");
  });

  it("works with only name", () => {
    const url = linkedInSearchUrl({ name: "John Doe" });
    expect(url).not.toBeNull();
    expect(decodeURIComponent(url!).replace(/\+/g, " ")).toContain("John Doe");
    expect(url).not.toContain("undefined");
  });

  it("works with only company (rare but possible)", () => {
    const url = linkedInSearchUrl({ company: "Acme" });
    expect(url).not.toBeNull();
    expect(decodeURIComponent(url!).replace(/\+/g, " ")).toContain("Acme");
  });

  it("returns null when both fields are empty", () => {
    expect(linkedInSearchUrl({})).toBeNull();
    expect(linkedInSearchUrl({ name: "", company: "" })).toBeNull();
    expect(linkedInSearchUrl({ name: "   ", company: "  " })).toBeNull();
  });

  it("trims whitespace from inputs", () => {
    const url = linkedInSearchUrl({ name: "  John  ", company: "  Acme  " });
    expect(decodeURIComponent(url!).replace(/\+/g, " ")).toContain("John Acme");
    // No double-space from preserving raw whitespace
    expect(decodeURIComponent(url!).replace(/\+/g, " ")).not.toContain("  ");
  });
});
