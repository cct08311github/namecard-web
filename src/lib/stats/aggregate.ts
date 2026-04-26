import type { CardSummary } from "@/db/cards";
import { computeTemperature, type TemperatureLevel } from "@/lib/cards/relationship-temp";
import type { RecapItem } from "@/lib/recap/group";

export interface PeriodStats {
  /** Total contact-event log count in the window. */
  logCount: number;
  /** New cards created in the window. */
  newCardCount: number;
  /** Distinct people the user logged with. */
  distinctPeople: number;
}

export interface TopPerson {
  card: CardSummary;
  logCount: number;
}

export interface TopCompany {
  /** Display name as it appears on the card (companyZh || companyEn). */
  companyName: string;
  /** Total log events from this company in the window. */
  logCount: number;
  /** Distinct people from this company logged with in the window. */
  distinctPeople: number;
}

export interface Streak {
  /** Consecutive days back-to-back from today with ≥1 log. */
  current: number;
  /** Longest run within the supplied event window. */
  longest: number;
}

export interface AggregatedStats {
  thisWeek: PeriodStats;
  thisMonth: PeriodStats;
  temperature: Record<TemperatureLevel, number>;
  streak: Streak;
  /** Top 3 most-logged-with people in last 30 days. */
  topPeople: TopPerson[];
  /** Top 3 most-logged-with companies in last 30 days. */
  topCompanies: TopCompany[];
  /** Total live (non-deleted) cards in the workspace. */
  totalCards: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function periodFor(
  items: readonly RecapItem[],
  cards: readonly CardSummary[],
  cutoff: Date,
): PeriodStats {
  let logCount = 0;
  const distinctPeople = new Set<string>();
  for (const item of items) {
    if (!item.event.at || item.event.at.getTime() < cutoff.getTime()) continue;
    logCount++;
    distinctPeople.add(item.card.id);
  }
  let newCardCount = 0;
  for (const card of cards) {
    if (!card.createdAt) continue;
    if (card.createdAt.getTime() >= cutoff.getTime()) newCardCount++;
  }
  return {
    logCount,
    newCardCount,
    distinctPeople: distinctPeople.size,
  };
}

function temperatureCounts(
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
  for (const c of cards) {
    counts[computeTemperature(c, now).level]++;
  }
  return counts;
}

/**
 * Streak = number of consecutive days back-to-back from today (inclusive
 * if there's at least 1 log today, otherwise from yesterday) where the
 * user logged ≥1 contact event.
 *
 * Longest = max consecutive-day run found in the supplied event window.
 * (Bounded by however much data the caller passed in — typically the
 * /recap 14-day window. Showing "longest streak in last 14 days" is a
 * reasonable scope; longer history can be added later.)
 */
function computeStreak(items: readonly RecapItem[], now: Date): Streak {
  // Build set of unique day-keys with at least one event.
  const days = new Set<string>();
  for (const it of items) {
    if (!it.event.at || it.event.at.getTime() <= 0) continue;
    days.add(isoDay(it.event.at));
  }
  if (days.size === 0) return { current: 0, longest: 0 };

  // Walk back from today (or yesterday) day-by-day until a gap.
  const todayKey = isoDay(now);
  const yesterdayKey = isoDay(new Date(now.getTime() - MS_PER_DAY));
  let current = 0;
  let cursor = days.has(todayKey)
    ? new Date(now)
    : days.has(yesterdayKey)
      ? new Date(now.getTime() - MS_PER_DAY)
      : null;
  while (cursor) {
    const key = isoDay(cursor);
    if (!days.has(key)) break;
    current++;
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
  }

  // Longest: scan sorted unique day list.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    const day = new Date(y, m - 1, d);
    if (prev && diffDays(day, prev) === 1) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = day;
  }

  return { current, longest };
}

function computeTopCompanies(items: readonly RecapItem[], cutoff: Date, limit = 3): TopCompany[] {
  const counts = new Map<
    string,
    { companyName: string; logCount: number; people: Set<string>; lastAt: number }
  >();
  for (const item of items) {
    if (!item.event.at || item.event.at.getTime() < cutoff.getTime()) continue;
    const companyName = (item.card.companyZh || item.card.companyEn || "").trim();
    if (!companyName) continue; // skip events whose card has no company
    const cur = counts.get(companyName);
    if (cur) {
      cur.logCount++;
      cur.people.add(item.card.id);
      cur.lastAt = Math.max(cur.lastAt, item.event.at.getTime());
    } else {
      counts.set(companyName, {
        companyName,
        logCount: 1,
        people: new Set([item.card.id]),
        lastAt: item.event.at.getTime(),
      });
    }
  }
  const list = [...counts.values()];
  list.sort((a, b) => {
    if (b.logCount !== a.logCount) return b.logCount - a.logCount;
    if (b.people.size !== a.people.size) return b.people.size - a.people.size;
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
    return a.companyName < b.companyName ? -1 : 1;
  });
  return list.slice(0, limit).map((x) => ({
    companyName: x.companyName,
    logCount: x.logCount,
    distinctPeople: x.people.size,
  }));
}

function computeTopPeople(items: readonly RecapItem[], cutoff: Date, limit = 3): TopPerson[] {
  const counts = new Map<string, { card: CardSummary; logCount: number; lastAt: number }>();
  for (const item of items) {
    if (!item.event.at || item.event.at.getTime() < cutoff.getTime()) continue;
    const cur = counts.get(item.card.id);
    if (cur) {
      cur.logCount++;
      cur.lastAt = Math.max(cur.lastAt, item.event.at.getTime());
    } else {
      counts.set(item.card.id, {
        card: item.card,
        logCount: 1,
        lastAt: item.event.at.getTime(),
      });
    }
  }
  const list = [...counts.values()];
  list.sort((a, b) => {
    if (b.logCount !== a.logCount) return b.logCount - a.logCount;
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
    return a.card.id < b.card.id ? -1 : 1;
  });
  return list.slice(0, limit).map((x) => ({ card: x.card, logCount: x.logCount }));
}

/**
 * One-shot aggregator. Caller supplies live cards + recent recap items
 * (already filtered to ≤ N days by listRecentContactEventsForUser) +
 * a deterministic `now`. No I/O, no LLM — just bucket sums.
 */
export function aggregateStats(
  cards: readonly CardSummary[],
  events: readonly RecapItem[],
  now: Date,
): AggregatedStats {
  const live = cards.filter((c) => !c.deletedAt);
  const weekCutoff = new Date(now.getTime() - 7 * MS_PER_DAY);
  const monthCutoff = new Date(now.getTime() - 30 * MS_PER_DAY);

  return {
    thisWeek: periodFor(events, live, weekCutoff),
    thisMonth: periodFor(events, live, monthCutoff),
    temperature: temperatureCounts(live, now),
    streak: computeStreak(events, now),
    topPeople: computeTopPeople(events, monthCutoff, 3),
    topCompanies: computeTopCompanies(events, monthCutoff, 3),
    totalCards: live.length,
  };
}
