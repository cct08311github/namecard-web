import type { RecapItem } from "./group";

/**
 * Pure in-memory filter over already-loaded recap items. Case-insensitive
 * substring match across event note + card name + company. Empty query
 * returns the input list as-is (no filtering). Whitespace-trimmed.
 *
 * Designed as a stop-gap before a real full-text index — covers the
 * 90% use case ("find the one where I talked about X") without
 * touching Typesense or adding new I/O.
 */
export function filterRecapItems(items: readonly RecapItem[], query: string): RecapItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];

  return items.filter((item) => {
    const haystacks = [
      item.event.note,
      item.card.nameZh,
      item.card.nameEn,
      item.card.companyZh,
      item.card.companyEn,
      item.card.jobTitleZh,
      item.card.jobTitleEn,
      item.card.firstMetEventTag,
    ];
    for (const field of haystacks) {
      if (typeof field !== "string") continue;
      if (field.toLowerCase().includes(needle)) return true;
    }
    return false;
  });
}
