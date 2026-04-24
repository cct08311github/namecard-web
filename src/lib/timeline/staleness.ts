import type { CardSummary } from "@/db/cards";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days since the user last logged contact with this card. Falls back to
 * createdAt when lastContactedAt is null. Returns null when both are
 * missing (can't compute staleness).
 */
export function daysSinceContact(card: CardSummary, now: Date): number | null {
  const last = card.lastContactedAt ?? card.createdAt;
  if (!last) return null;
  const ms = now.getTime() - last.getTime();
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

/**
 * Whether to surface a 「N 天沒聯絡」 badge on the list/gallery.
 * Pinned cards are intentionally exempt — core contacts shouldn't
 * show a pestering badge. Threshold defaults to 30 days.
 */
export function shouldShowStaleBadge(card: CardSummary, now: Date, thresholdDays = 30): boolean {
  if (card.isPinned) return false;
  const days = daysSinceContact(card, now);
  return days !== null && days >= thresholdDays;
}
