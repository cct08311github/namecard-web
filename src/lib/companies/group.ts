import type { CardSummary } from "@/db/cards";

export interface CompanyGroup {
  /** Stable URL slug derived from the canonical company name. */
  slug: string;
  /** Display name — first non-empty companyZh wins, else companyEn. */
  displayName: string;
  /**
   * Cards in this company, ordered by last touch (lastContactedAt → createdAt) desc.
   * The first card is the "primary contact" surfacer for /companies index.
   */
  cards: CardSummary[];
  /** Most-recent activity for sorting at the index level. */
  mostRecentTouch: Date | null;
}

/**
 * Pick the canonical "company" string for grouping. Trims and prefers
 * the Chinese name when both exist (consistent with how the rest of
 * the UI prefers nameZh over nameEn).
 */
export function pickCanonicalCompany(card: CardSummary): string {
  const zh = (card.companyZh ?? "").trim();
  const en = (card.companyEn ?? "").trim();
  return zh || en;
}

/**
 * Stable lowercase + trimmed key used to coalesce variants like
 * "ACME" / "acme " / "Acme" into one bucket.
 */
function companyKey(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * URL-safe slug. We intentionally keep CJK characters (slugs in
 * Next dynamic routes accept Unicode) so 「智威科技」 stays readable in
 * the URL. ASCII whitespace and punctuation collapse to single dashes.
 */
export function companySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[.,;:!?()[\]{}<>"'`*+&%$#@|\\]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Cluster cards by company. Cards with no company name are dropped
 * (they're not "company contacts" — they live in /cards general view).
 * Soft-deleted cards are excluded.
 *
 * Each group's cards are sorted by `lastContactedAt` desc with
 * `createdAt` as tiebreak so the top of the list is "most relevant"
 * — useful for both the /companies index card preview and the
 * /companies/[slug] page.
 */
export function groupCardsByCompany(cards: readonly CardSummary[]): CompanyGroup[] {
  const buckets = new Map<string, { displayName: string; cards: CardSummary[] }>();

  for (const card of cards) {
    if (card.deletedAt) continue;
    const canonical = pickCanonicalCompany(card);
    if (!canonical) continue;
    const key = companyKey(canonical);
    const existing = buckets.get(key);
    if (existing) {
      existing.cards.push(card);
    } else {
      buckets.set(key, { displayName: canonical, cards: [card] });
    }
  }

  const groups: CompanyGroup[] = [];
  for (const bucket of buckets.values()) {
    bucket.cards.sort((a, b) => {
      const ta = a.lastContactedAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
      const tb = b.lastContactedAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });
    const head = bucket.cards[0];
    const mostRecentTouch = head?.lastContactedAt ?? head?.createdAt ?? null;
    groups.push({
      slug: companySlug(bucket.displayName),
      displayName: bucket.displayName,
      cards: bucket.cards,
      mostRecentTouch,
    });
  }

  // Most-recently-touched company first; tiebreak on slug for stability.
  groups.sort((a, b) => {
    const ta = a.mostRecentTouch?.getTime() ?? 0;
    const tb = b.mostRecentTouch?.getTime() ?? 0;
    if (ta !== tb) return tb - ta;
    return a.slug.localeCompare(b.slug);
  });
  return groups;
}

/**
 * Find a single company group by slug. Returns null if no live card
 * matches. O(N) over the cards list — fine for the 200/500-card cap
 * the rest of the app uses.
 */
export function findCompanyBySlug(
  cards: readonly CardSummary[],
  slug: string,
): CompanyGroup | null {
  const wanted = slug.toLowerCase();
  for (const group of groupCardsByCompany(cards)) {
    if (group.slug === wanted) return group;
  }
  return null;
}
