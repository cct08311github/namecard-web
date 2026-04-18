import { describe, expect, it } from "vitest";

import { DEFAULT_TAG_COLOR, isPaletteColor, TAG_PALETTE } from "../palette";

describe("tag palette", () => {
  it("exposes exactly 8 entries", () => {
    expect(TAG_PALETTE).toHaveLength(8);
  });

  it("all entries use oklch color space", () => {
    for (const entry of TAG_PALETTE) {
      expect(entry.oklch).toMatch(/^oklch\(/);
    }
  });

  it("every entry has a unique id and label", () => {
    const ids = new Set(TAG_PALETTE.map((p) => p.id));
    const labels = new Set(TAG_PALETTE.map((p) => p.label));
    expect(ids.size).toBe(TAG_PALETTE.length);
    expect(labels.size).toBe(TAG_PALETTE.length);
  });

  it("isPaletteColor validates stored colors", () => {
    expect(isPaletteColor(TAG_PALETTE[0]?.oklch)).toBe(true);
    expect(isPaletteColor("oklch(99% 0 0)")).toBe(false);
    expect(isPaletteColor(undefined)).toBe(false);
    expect(isPaletteColor("#ff0000")).toBe(false);
  });

  it("DEFAULT_TAG_COLOR is in the palette", () => {
    expect(isPaletteColor(DEFAULT_TAG_COLOR)).toBe(true);
  });
});
