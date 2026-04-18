import type { CardSummary } from "@/db/cards";

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
