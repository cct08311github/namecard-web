import type { CardSummary } from "@/db/cards";

import { computeTemperature, type TemperatureLevel } from "./relationship-temp";

/**
 * Client-side fallback tag filter. Used when Typesense is unavailable
 * or for tiny workspaces where a round-trip is wasted. Mirrors the
 * AND/OR semantics of `buildSearchParams`.
 *
 *   - OR  = card has at least one of the requested tagIds
 *   - AND = card has every requested tagId
 *   - []  = pass-through (no filter)
 */

export type TagMode = "or" | "and";

export function applyTagFilter(
  cards: readonly CardSummary[],
  tagIds: readonly string[],
  mode: TagMode,
): CardSummary[] {
  if (tagIds.length === 0) return [...cards];
  const wanted = new Set(tagIds);
  return cards.filter((card) => {
    const owned = card.tagIds ?? [];
    if (mode === "or") {
      return owned.some((id) => wanted.has(id));
    }
    // AND: every wanted id must be owned.
    const ownedSet = new Set(owned);
    return tagIds.every((id) => ownedSet.has(id));
  });
}

/**
 * Filter cards whose computed temperature is in the requested levels
 * (OR semantics). Empty levels = pass-through (no filter applied).
 *
 * `now` is passed in so tests can fix a reference time and the page
 * renders deterministically across the request lifecycle.
 */
export function filterByTemperature(
  cards: readonly CardSummary[],
  levels: readonly TemperatureLevel[],
  now: Date,
): CardSummary[] {
  if (levels.length === 0) return [...cards];
  const wanted = new Set<TemperatureLevel>(levels);
  return cards.filter((card) => wanted.has(computeTemperature(card, now).level));
}

/**
 * Counts of cards by temperature level. Used by the filter bar to show
 * "🔥 12 / ✨ 34 / ..." per chip alongside the tag filter.
 */
export function countByTemperature(
  cards: readonly CardSummary[],
  now: Date,
): Record<TemperatureLevel, number> {
  const counts: Record<TemperatureLevel, number> = {
    hot: 0,
    warm: 0,
    active: 0,
    quiet: 0,
    cold: 0,
  };
  for (const card of cards) {
    const { level } = computeTemperature(card, now);
    counts[level]++;
  }
  return counts;
}
