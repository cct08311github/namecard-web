import type { CardSummary, ContactEvent } from "@/db/cards";

export interface RecapItem {
  card: CardSummary;
  event: ContactEvent;
}

export interface RecapGroup {
  /** Stable sort key — ISO date YYYY-MM-DD of the bucket's local day. */
  key: string;
  /** Human-readable label in zh-Hant ("今天" / "昨天" / "本週三" / "M 月 D 日"). */
  label: string;
  /** Items in this bucket, newest first. */
  items: RecapItem[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(later: Date, earlier: Date): number {
  return Math.floor(
    (startOfLocalDay(later).getTime() - startOfLocalDay(earlier).getTime()) / MS_PER_DAY,
  );
}

function labelFor(eventAt: Date, now: Date): string {
  const days = diffDays(now, eventAt);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) {
    const wd = WEEKDAYS_ZH[eventAt.getDay()]!;
    return `本週${wd}`;
  }
  if (days < 14) {
    const wd = WEEKDAYS_ZH[eventAt.getDay()]!;
    return `上週${wd}`;
  }
  return `${eventAt.getMonth() + 1} 月 ${eventAt.getDate()} 日`;
}

/**
 * Bucket recap items by local day. Within each bucket, items keep the
 * caller's ordering (callers should pass newest-first). Buckets
 * themselves are returned newest-first by date key.
 *
 * Skips items whose event timestamp is null/epoch (defensive — a bad
 * Firestore read could yield Date(0); we don't want a "1970-01-01"
 * bucket polluting the recap).
 */
export function groupRecapByDay(items: readonly RecapItem[], now: Date): RecapGroup[] {
  const buckets = new Map<string, RecapGroup>();
  for (const item of items) {
    const at = item.event.at;
    if (!at || at.getTime() <= 0) continue;
    const key = isoDay(at);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label: labelFor(at, now), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(item);
  }
  // Stable order: newest day first via reverse-lex on YYYY-MM-DD
  return [...buckets.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}
