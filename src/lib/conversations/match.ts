import type { CardSummary } from "@/db/cards";

/**
 * Fuzzy person-name → card matcher used by the 對話速記 flow.
 *
 * Scope is intentionally narrow: cards already filtered to the caller's
 * workspace. We never reach across users; matching is purely a string
 * problem on the in-memory list.
 *
 * Match tiers (each card emits its best tier across nameZh/nameEn/
 * namePhonetic; lower number wins; ties keep DB order):
 *   0 — exact (case-insensitive, trimmed)
 *   1 — prefix
 *   2 — substring
 *
 * Cards with no name fields are dropped. Empty/whitespace input returns [].
 */
export function matchPersonName(name: string, cards: readonly CardSummary[]): CardSummary[] {
  const needle = name.trim().toLowerCase();
  if (!needle) return [];

  const scored: Array<{ card: CardSummary; tier: number; index: number }> = [];
  cards.forEach((card, index) => {
    const tier = bestTierFor(card, needle);
    if (tier !== null) scored.push({ card, tier, index });
  });

  scored.sort((a, b) => a.tier - b.tier || a.index - b.index);
  return scored.map((s) => s.card);
}

function bestTierFor(card: CardSummary, needle: string): number | null {
  const candidates = [card.nameZh, card.nameEn, card.namePhonetic]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));
  if (candidates.length === 0) return null;

  let best: number | null = null;
  for (const candidate of candidates) {
    const tier = scoreString(candidate, needle);
    if (tier === null) continue;
    if (best === null || tier < best) best = tier;
    if (best === 0) return 0;
  }
  return best;
}

function scoreString(haystack: string, needle: string): number | null {
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.includes(needle)) return 2;
  return null;
}
