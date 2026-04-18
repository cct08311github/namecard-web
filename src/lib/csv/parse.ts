import Papa from "papaparse";

/**
 * Parsed CSV representation.
 * headers — first row, trimmed.
 * rows — 2-D array of remaining rows; empty rows are dropped.
 */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a raw CSV text string into headers + data rows.
 *
 * - Strips UTF-8 BOM if present.
 * - Handles quoted commas and escaped double-quotes (papaparse).
 * - Drops rows where every cell is empty (skipEmptyLines:"greedy").
 * - Trims every cell.
 */
export function parseCsvText(text: string): ParsedCsv {
  // Strip UTF-8 BOM (EF BB BF or the Unicode equivalent U+FEFF).
  const cleaned = text.startsWith("\uFEFF") ? text.slice(1) : text;

  const result = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: "greedy",
  });

  const raw = result.data as string[][];

  if (raw.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = raw[0].map((h) => h.trim());
  const rows = raw.slice(1).map((row) => row.map((cell) => cell.trim()));

  return { headers, rows };
}
