import type { CardCreateInput } from "@/db/schema";
import type { CardSummary } from "@/db/cards";

export type DedupeReason = "email-match" | "name-company-match" | "none";

export interface DedupeResult {
  row: CardCreateInput;
  match?: CardSummary;
  reason: DedupeReason;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeStr(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Composite key: (nameZh||nameEn)+(companyZh||companyEn), both lowercased/trimmed.
 * Returns null when either component is empty.
 */
function nameCompanyKey(
  name: string | undefined,
  nameAlt: string | undefined,
  company: string | undefined,
  companyAlt: string | undefined,
): string | null {
  const n = normalizeStr(name) || normalizeStr(nameAlt);
  const c = normalizeStr(company) || normalizeStr(companyAlt);
  if (!n || !c) return null;
  return `${n}::${c}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect duplicates across an incoming batch against the existing card set.
 *
 * Rules (evaluated in priority order):
 *   1. Email match   — any email in incoming matches any email in existing (case-insensitive).
 *   2. Name+company  — (nameZh||nameEn) + (companyZh||companyEn) matches case-insensitively.
 *
 * Returns one result per incoming row, preserving input order.
 */
export function detectDuplicates(
  incoming: readonly CardCreateInput[],
  existing: readonly CardSummary[],
): DedupeResult[] {
  // Pre-build indexes for O(n) matching.

  // email → first matching CardSummary
  const emailIndex = new Map<string, CardSummary>();
  // name::company key → first matching CardSummary
  const nameCompanyIndex = new Map<string, CardSummary>();

  for (const card of existing) {
    for (const e of card.emails) {
      const key = normalizeStr(e.value);
      if (key && !emailIndex.has(key)) {
        emailIndex.set(key, card);
      }
    }
    const ncKey = nameCompanyKey(card.nameZh, card.nameEn, card.companyZh, card.companyEn);
    if (ncKey && !nameCompanyIndex.has(ncKey)) {
      nameCompanyIndex.set(ncKey, card);
    }
  }

  return incoming.map((row): DedupeResult => {
    // 1. Email match
    for (const e of row.emails) {
      const key = normalizeStr(e.value);
      if (key) {
        const match = emailIndex.get(key);
        if (match) return { row, match, reason: "email-match" };
      }
    }

    // 2. Name+company composite fallback
    const ncKey = nameCompanyKey(row.nameZh, row.nameEn, row.companyZh, row.companyEn);
    if (ncKey) {
      const match = nameCompanyIndex.get(ncKey);
      if (match) return { row, match, reason: "name-company-match" };
    }

    return { row, reason: "none" };
  });
}
