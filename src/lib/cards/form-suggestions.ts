import type { CardSummary } from "@/db/cards";

import type { CardFormSuggestions } from "@/components/cards/CardForm";

const MAX_PER_LIST = 100;

function pushIf(set: Set<string>, value: string | undefined | null): void {
  if (!value) return;
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
}

/**
 * Walk the workspace's card list and collect deduped value sets per
 * suggestion field. Used by /cards/new + /cards/[id]/edit to feed the
 * <datalist> hints in CardForm so the second card avoids spelling
 * drift from the first ("智威" vs "智威科技").
 *
 * Caps each list at 100 entries — far above what any real workspace
 * needs to surface, and keeps the inline HTML payload bounded.
 */
export function collectFormSuggestions(cards: readonly CardSummary[]): CardFormSuggestions {
  const companies = new Set<string>();
  const jobTitles = new Set<string>();
  const departments = new Set<string>();
  const events = new Set<string>();
  for (const c of cards) {
    if (c.deletedAt) continue;
    pushIf(companies, c.companyZh);
    pushIf(companies, c.companyEn);
    pushIf(jobTitles, c.jobTitleZh);
    pushIf(jobTitles, c.jobTitleEn);
    pushIf(departments, c.department);
    pushIf(events, c.firstMetEventTag);
  }
  return {
    companies: [...companies].slice(0, MAX_PER_LIST),
    jobTitles: [...jobTitles].slice(0, MAX_PER_LIST),
    departments: [...departments].slice(0, MAX_PER_LIST),
    events: [...events].slice(0, MAX_PER_LIST),
  };
}
