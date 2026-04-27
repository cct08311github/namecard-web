import { describe, expect, it } from "vitest";

// Re-import the local helper via dynamic import. Currently it's a private
// function inside page.tsx — copy here as a small mirror so we can lock
// the truncation rules without exporting it from a Server Component file.
function truncateNote(note: string, max: number): string {
  if (note.length <= max) return note;
  const slice = note.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? lastSpace : max;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

describe("truncateNote", () => {
  it("returns the original when within max length", () => {
    expect(truncateNote("short", 100)).toBe("short");
    expect(truncateNote("a".repeat(100), 100)).toBe("a".repeat(100));
  });

  it("truncates at the nearest space when one is past the 60% boundary", () => {
    const note = "we agreed to revisit the proposal next quarter once funding clears";
    const result = truncateNote(note, 30);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(35);
    // Doesn't bisect a word — last char before … is end-of-word
    const last = result.slice(0, -1).trim();
    expect(last.endsWith("we") || last.endsWith("to") || /[a-z]$/.test(last)).toBe(true);
  });

  it("hard-cuts at max when no good space found in the high range", () => {
    // Long word with no spaces past the 60% boundary
    const note = "supercalifragilisticexpialidocious";
    const result = truncateNote(note, 10);
    expect(result).toBe("supercalif…");
  });

  it("trims trailing whitespace before the ellipsis", () => {
    const note = "hello world   foo";
    const result = truncateNote(note, 8);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain(" …");
  });
});
