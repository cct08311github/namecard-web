import type { CardSummary, ContactEvent } from "@/db/cards";

export interface FollowupSuggestion {
  /** YYYY-MM-DD; safe to drop straight into <input type="date">. */
  isoDate: string;
  /** Short human zh-Hant explanation for tooltip / aria-label. */
  reasonZh: string;
  /** Source of the cadence — lets the UI label it differently. */
  basedOn: "rhythm" | "default";
  /** Days from `now` that this suggestion lands on. UI may surface for context. */
  offsetDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_GAP_DAYS = 30;
const MIN_OFFSET_DAYS = 7;
const MAX_OFFSET_DAYS = 180;
/** Need at least 2 valid events to compute a gap, so 2 is the minimum. */
const MIN_EVENTS_FOR_RHYTHM = 2;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Median (not mean) of consecutive gaps — robust against the
 * one-off-burst pattern (e.g. user hammered 3 conversations during a
 * conference week, then nothing for a month).
 */
function medianGapDays(events: readonly ContactEvent[]): number | null {
  // Filter to valid timestamps, sort newest first → walk pairs.
  const sorted = events
    .filter((e) => e.at && e.at.getTime() > 0)
    .map((e) => e.at.getTime())
    .sort((a, b) => b - a);
  if (sorted.length < MIN_EVENTS_FOR_RHYTHM) return null;

  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const ms = sorted[i]! - sorted[i + 1]!;
    if (ms > 0) gaps.push(ms / MS_PER_DAY);
  }
  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!;
}

/**
 * Pure suggestion. No LLM, no I/O. Caller owns fetching the card +
 * recent events; we just do the date math.
 */
export function suggestNextFollowupDate(
  _card: Readonly<CardSummary>,
  events: readonly ContactEvent[],
  now: Date,
): FollowupSuggestion {
  const median = medianGapDays(events);

  if (median === null) {
    const offset = DEFAULT_GAP_DAYS;
    const next = startOfLocalDay(new Date(now.getTime() + offset * MS_PER_DAY));
    return {
      isoDate: isoDay(next),
      reasonZh: `預設每 ${offset} 天提醒一次（還沒有足夠的對話節奏資料）`,
      basedOn: "default",
      offsetDays: offset,
    };
  }

  const rounded = Math.round(median);
  const offset = clamp(rounded, MIN_OFFSET_DAYS, MAX_OFFSET_DAYS);
  const next = startOfLocalDay(new Date(now.getTime() + offset * MS_PER_DAY));
  const clamped = offset !== rounded;
  const reasonZh = clamped
    ? `你跟他平均每 ${rounded} 天聊一次，建議 ${offset} 天後（範圍 ${MIN_OFFSET_DAYS}–${MAX_OFFSET_DAYS} 天）`
    : `你跟他平均每 ${offset} 天聊一次`;
  return {
    isoDate: isoDay(next),
    reasonZh,
    basedOn: "rhythm",
    offsetDays: offset,
  };
}
