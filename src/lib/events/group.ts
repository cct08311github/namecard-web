import type { CardSummary } from "@/db/cards";

export interface EventGroup {
  /** Stable URL slug derived from the canonical tag string. */
  slug: string;
  /** Display name — the original tag as the user typed it (first occurrence wins). */
  displayName: string;
  /** Cards in this event, ordered by firstMetDate desc (most-recent meet first). */
  cards: CardSummary[];
  /** Most-recent meet for sorting at the index level. */
  mostRecentMet: Date | null;
}

function eventKey(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * URL-safe slug — keep CJK characters (Next dynamic routes accept
 * Unicode), collapse spaces / punctuation. Mirror of companySlug
 * deliberately, since the URL semantics are identical.
 */
export function eventSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[.,;:!?()[\]{}<>"'`*+&%$#@|\\]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFirstMetDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Cluster cards by `firstMetEventTag`. Cards with no tag are dropped
 * (they belong in the general /cards view, not the event hub).
 * Soft-deleted cards are excluded.
 *
 * Within each group, cards sort by firstMetDate desc — recent meets
 * surface first within an event. Across groups, sort by mostRecentMet
 * so events you're still adding to live near the top.
 */
export function groupCardsByEvent(cards: readonly CardSummary[]): EventGroup[] {
  const buckets = new Map<string, { displayName: string; cards: CardSummary[] }>();

  for (const card of cards) {
    if (card.deletedAt) continue;
    const tag = (card.firstMetEventTag ?? "").trim();
    if (!tag) continue;
    const key = eventKey(tag);
    const existing = buckets.get(key);
    if (existing) {
      existing.cards.push(card);
    } else {
      buckets.set(key, { displayName: tag, cards: [card] });
    }
  }

  const groups: EventGroup[] = [];
  for (const bucket of buckets.values()) {
    bucket.cards.sort((a, b) => {
      const ta = parseFirstMetDate(a.firstMetDate)?.getTime() ?? a.createdAt?.getTime() ?? 0;
      const tb = parseFirstMetDate(b.firstMetDate)?.getTime() ?? b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });
    const head = bucket.cards[0];
    const mostRecentMet = parseFirstMetDate(head?.firstMetDate) ?? head?.createdAt ?? null;
    groups.push({
      slug: eventSlug(bucket.displayName),
      displayName: bucket.displayName,
      cards: bucket.cards,
      mostRecentMet,
    });
  }

  groups.sort((a, b) => {
    const ta = a.mostRecentMet?.getTime() ?? 0;
    const tb = b.mostRecentMet?.getTime() ?? 0;
    if (ta !== tb) return tb - ta;
    // Lexical compare (codepoint) instead of localeCompare so the
    // tiebreak is platform-stable. macOS would sort CJK by pinyin,
    // Linux falls back to codepoint — that mismatch was a real CI
    // flake source in #73.
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  return groups;
}

export function findEventBySlug(cards: readonly CardSummary[], slug: string): EventGroup | null {
  const wanted = slug.toLowerCase();
  for (const group of groupCardsByEvent(cards)) {
    if (group.slug === wanted) return group;
  }
  return null;
}
