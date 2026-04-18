/**
 * Fixed 8-color tag palette. Chosen so every color reads on both
 * `--color-paper` (light mode) and the dark mode inversion without
 * tuning per theme. Keep the oklch lightness ~60% and chroma low
 * enough that dark text stays legible when overlaid.
 *
 * Intentionally decoupled from `tokens.css` — tag colors are an
 * internal controlled vocabulary, not a design token surface.
 */

export interface TagPaletteEntry {
  id: TagColorId;
  label: string;
  oklch: string;
}

export type TagColorId = "clay" | "bamboo" | "ocean" | "iris" | "plum" | "sand" | "moss" | "slate";

export const TAG_PALETTE: readonly TagPaletteEntry[] = [
  { id: "clay", label: "赤陶", oklch: "oklch(62% 0.14 35)" },
  { id: "bamboo", label: "竹青", oklch: "oklch(68% 0.12 145)" },
  { id: "ocean", label: "海藍", oklch: "oklch(60% 0.13 235)" },
  { id: "iris", label: "鳶尾", oklch: "oklch(60% 0.14 295)" },
  { id: "plum", label: "梅紫", oklch: "oklch(58% 0.12 340)" },
  { id: "sand", label: "沙金", oklch: "oklch(72% 0.11 80)" },
  { id: "moss", label: "苔綠", oklch: "oklch(52% 0.08 135)" },
  { id: "slate", label: "石板", oklch: "oklch(50% 0.02 260)" },
];

const PALETTE_SET = new Set(TAG_PALETTE.map((p) => p.oklch));

/** Validate that a stored color is still in the palette (defends against stale data). */
export function isPaletteColor(value: string | undefined): value is string {
  return Boolean(value && PALETTE_SET.has(value));
}

/** Default tag color when user doesn't pick one. */
export const DEFAULT_TAG_COLOR = TAG_PALETTE[7]!.oklch; // slate
