import type { CardSummary } from "@/db/cards";

import { computeTemperature, type TemperatureLevel } from "./relationship-temp";

export type SortKey = "newest" | "oldest" | "contacted" | "name" | "tempHot" | "tempCold";

export const SORT_KEYS: readonly SortKey[] = [
  "newest",
  "oldest",
  "contacted",
  "name",
  "tempHot",
  "tempCold",
];

export function parseSortKey(raw: unknown): SortKey {
  if (typeof raw !== "string") return "newest";
  return (SORT_KEYS as readonly string[]).includes(raw) ? (raw as SortKey) : "newest";
}

// Level ordering used by tempHot / tempCold sorts. Higher number = warmer.
const LEVEL_RANK: Record<TemperatureLevel, number> = {
  hot: 4,
  warm: 3,
  active: 2,
  quiet: 1,
  cold: 0,
};

function primaryName(c: CardSummary): string {
  return c.nameZh || c.nameEn || "";
}

/**
 * Pure sort — returns a new array, doesn't mutate input. Stable because
 * fall-through comparators rely on `id` last.
 *
 * - newest: createdAt desc (null last)
 * - oldest: createdAt asc (null last)
 * - contacted: lastContactedAt desc (null last — "no contact" is stalest)
 * - name: primary name localeCompare("zh-Hant")；name-less cards sink
 */
export function sortCards(cards: CardSummary[], key: SortKey): CardSummary[] {
  const out = [...cards];
  switch (key) {
    case "newest":
      out.sort((a, b) => tsDesc(a.createdAt, b.createdAt) || stableFallback(a, b));
      break;
    case "oldest":
      out.sort((a, b) => tsAsc(a.createdAt, b.createdAt) || stableFallback(a, b));
      break;
    case "contacted":
      out.sort((a, b) => tsDesc(a.lastContactedAt, b.lastContactedAt) || stableFallback(a, b));
      break;
    case "name": {
      const collator = new Intl.Collator("zh-Hant", { sensitivity: "base", numeric: true });
      out.sort((a, b) => {
        const na = primaryName(a);
        const nb = primaryName(b);
        if (na && !nb) return -1;
        if (!na && nb) return 1;
        const cmp = collator.compare(na, nb);
        return cmp !== 0 ? cmp : stableFallback(a, b);
      });
      break;
    }
    case "tempHot":
    case "tempCold": {
      // Compute temperature once per card before sort to keep the
      // comparator O(1) per call. Pinned cards' "warm floor" is honored
      // because computeTemperature already does that bump.
      const now = new Date();
      const ranks = new Map<string, number>();
      for (const c of out) {
        ranks.set(c.id, LEVEL_RANK[computeTemperature(c, now).level]);
      }
      out.sort((a, b) => {
        const ra = ranks.get(a.id) ?? 0;
        const rb = ranks.get(b.id) ?? 0;
        if (ra !== rb) return key === "tempHot" ? rb - ra : ra - rb;
        // Within the same tier, fall back to recency so the secondary
        // ordering still feels intuitive (most-recent-contact within
        // the tier surfaces first).
        return tsDesc(a.lastContactedAt, b.lastContactedAt) || stableFallback(a, b);
      });
      break;
    }
  }
  return out;
}

// Date desc where null goes to the bottom (after all non-null values).
function tsDesc(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.getTime() - a.getTime();
}

function tsAsc(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.getTime() - b.getTime();
}

// Deterministic tiebreaker so identical primary keys don't shuffle
// between renders. Uses id lexical order.
function stableFallback(a: CardSummary, b: CardSummary): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
