import type { CardSummary } from "@/db/cards";

export type TemperatureLevel = "hot" | "warm" | "active" | "quiet" | "cold";

export interface Temperature {
  level: TemperatureLevel;
  emoji: string;
  /** Short zh-Hant label, suitable for tooltip / aria. */
  label: string;
  /** Days since the relationship "warmth source" (lastContactedAt or createdAt). null when both are missing. */
  daysSince: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOT_THRESHOLD_DAYS = 7;
const WARM_THRESHOLD_DAYS = 30;
const ACTIVE_THRESHOLD_DAYS = 90;
const QUIET_THRESHOLD_DAYS = 180;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

const LABELS: Record<TemperatureLevel, { emoji: string; label: string }> = {
  hot: { emoji: "🔥", label: "本週聯絡過" },
  warm: { emoji: "✨", label: "本月聯絡過" },
  active: { emoji: "💫", label: "近 3 個月聯絡過" },
  quiet: { emoji: "🌙", label: "已 6 個月內聯絡" },
  cold: { emoji: "💤", label: "超過 6 個月未聯絡" },
};

/**
 * Pure derivation of relationship "temperature" from a card's signals.
 *
 * Rules:
 *   - Source date = lastContactedAt; falls back to createdAt for cards
 *     that have never been logged (so brand-new cards aren't misleadingly
 *     marked cold).
 *   - Negative days (future date — clock skew, weird import data) clamp
 *     to 0 so the future-source-card gets the warmest tier rather than
 *     a nonsensical cold one.
 *   - isPinned acts as a *floor*: a pinned card never shows quiet/cold,
 *     because the user explicitly said it's important. Falls back to
 *     "warm" so it stays visible without overstating recency.
 *   - When both lastContactedAt and createdAt are null we still surface
 *     a temperature (cold or warm-via-pin). daysSince is null in that
 *     case so the UI can suppress the "N days" sub-label cleanly.
 */
export function computeTemperature(card: Readonly<CardSummary>, now: Date): Temperature {
  const sourceDate = card.lastContactedAt ?? card.createdAt;
  const isPinned = Boolean(card.isPinned);

  if (!sourceDate) {
    const level: TemperatureLevel = isPinned ? "warm" : "cold";
    return { level, ...LABELS[level], daysSince: null };
  }

  const days = Math.max(0, daysBetween(now, sourceDate));
  let level: TemperatureLevel;
  if (days <= HOT_THRESHOLD_DAYS) level = "hot";
  else if (days <= WARM_THRESHOLD_DAYS) level = "warm";
  else if (days <= ACTIVE_THRESHOLD_DAYS) level = "active";
  else if (days <= QUIET_THRESHOLD_DAYS) level = "quiet";
  else level = "cold";

  if (isPinned && (level === "quiet" || level === "cold")) {
    level = "warm";
  }

  return { level, ...LABELS[level], daysSince: days };
}
