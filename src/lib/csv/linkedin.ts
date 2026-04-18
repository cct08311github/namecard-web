/**
 * LinkedIn export format detection and canonical field mapping.
 */

export type CanonicalCardField =
  | "nameEn" // given+family joined
  | "firstName" // raw
  | "lastName" // raw
  | "emailWork" // primary email
  | "companyEn"
  | "jobTitleEn"
  | "firstMetDate" // parse "DD Mon YYYY" or "YYYY-MM-DD"
  | "notes" // raw "Notes" / "Message" column
  | "ignored"; // drop silently

export interface LinkedInColumnMap {
  /** Maps each CSV header (as it appears in file) → canonical field. */
  columns: Record<string, CanonicalCardField>;
  /** Confidence this is a LinkedIn export, 0–1. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Normalisation helper
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Known LinkedIn header → canonical field mappings
// Keys are the *normalised* header (lowercase, stripped non-alphanumeric).
// ---------------------------------------------------------------------------

const LINKEDIN_MAP: Record<string, CanonicalCardField> = {
  // Names
  firstname: "firstName",
  lastname: "lastName",
  // Email variants
  emailaddress: "emailWork",
  email: "emailWork",
  // Company
  company: "companyEn",
  companyname: "companyEn",
  // Title / position
  position: "jobTitleEn",
  title: "jobTitleEn",
  currentposition: "jobTitleEn",
  // Connection date
  connectedon: "firstMetDate",
  connecteddate: "firstMetDate",
  // Notes / message
  notes: "notes",
  message: "notes",
  // Ignored fields
  url: "ignored",
  profileurl: "ignored",
};

/**
 * Core LinkedIn fields used to compute confidence.
 * A real LinkedIn export has at least 4 of these 6.
 */
const CORE_KEYS = new Set([
  "firstname",
  "lastname",
  "emailaddress",
  "email",
  "company",
  "companyname",
  "position",
  "title",
  "currentposition",
  "connectedon",
  "connecteddate",
]);

// Core field groups (deduped so two variants of the same field don't double-count)
const CORE_GROUPS: string[][] = [
  ["firstname"],
  ["lastname"],
  ["emailaddress", "email"],
  ["company", "companyname"],
  ["position", "title", "currentposition"],
  ["connectedon", "connecteddate"],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fuzzy-matches CSV headers against known LinkedIn export schemas.
 *
 * Returns a map of original-header → canonical field plus a confidence score
 * between 0 and 1. confidence >= 0.7 is treated as "auto-detected".
 */
export function detectLinkedInFormat(headers: string[]): LinkedInColumnMap {
  const columns: Record<string, CanonicalCardField> = {};
  const normalizedHeaders = headers.map(normalizeHeader);

  // Build column map using original headers as keys.
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizedHeaders[i];
    columns[headers[i]] = LINKEDIN_MAP[norm] ?? "ignored";
  }

  // Compute confidence: count how many of the 6 core groups are present.
  const normalizedSet = new Set(normalizedHeaders);
  let matchedGroups = 0;
  for (const group of CORE_GROUPS) {
    if (group.some((key) => normalizedSet.has(key))) {
      matchedGroups++;
    }
  }

  // Also require at least one CORE_KEYS match to avoid false positives.
  const hasCoreKey = normalizedHeaders.some((n) => CORE_KEYS.has(n));
  const confidence = hasCoreKey ? matchedGroups / CORE_GROUPS.length : 0;

  return { columns, confidence };
}
