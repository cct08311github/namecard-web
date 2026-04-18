import type { CardCreateInput } from "@/db/schema";

import { suggestTagsByLlm } from "./suggest-llm";
import { suggestTagsByRules } from "./suggest-rules";

export interface SuggestOptions {
  /** Existing workspace tag names — LLM prefers re-using these. */
  existingTagNames: string[];
  /** Maximum suggestions to return. Default 5. */
  max?: number;
  /** Skip the LLM call (e.g., user disabled it). */
  rulesOnly?: boolean;
}

export interface SuggestResult {
  rules: string[];
  llm: string[];
  merged: string[];
}

/**
 * Orchestrate rules + LLM tag suggestions for a card.
 *
 * Rules run first, synchronously. If rules already saturate `max`,
 * the LLM is skipped entirely. LLM results degrade silently on error.
 * Merged list preserves rules-first ordering and deduplicates
 * case-insensitively, preserving the casing of whichever source
 * suggested the tag first.
 */
export async function suggestTags(
  card: CardCreateInput,
  options: SuggestOptions,
): Promise<SuggestResult> {
  const max = options.max ?? 5;

  const rules = suggestTagsByRules(card);

  let llm: string[] = [];
  if (!options.rulesOnly && rules.length < max) {
    llm = await suggestTagsByLlm(card, {
      existingTagNames: options.existingTagNames,
    });
  }

  // Merge: rules first, then LLM tags not already present (case-insensitive).
  const seenLower = new Set(rules.map((t) => t.toLowerCase()));
  const merged = [...rules];
  for (const tag of llm) {
    if (merged.length >= max) break;
    const lower = tag.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      merged.push(tag);
    }
  }

  return { rules, llm, merged };
}
