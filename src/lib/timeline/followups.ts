import type { CardSummary } from "@/db/cards";

import { daysSinceContact } from "./staleness";

export interface FollowupBucket {
  id: "critical" | "overdue" | "due" | "pinnedStale";
  title: string;
  description: string;
  cards: Array<{ card: CardSummary; days: number }>;
}

export interface FollowupGroups {
  critical: FollowupBucket;
  overdue: FollowupBucket;
  due: FollowupBucket;
  pinnedStale: FollowupBucket;
}

/**
 * Bucket cards by how overdue they are for a follow-up.
 *
 * Priority rules:
 *  - Pinned cards that are also stale (≥30 days) go to a dedicated
 *    `pinnedStale` bucket regardless of how old — core contacts live
 *    there, not in the general-purpose overdue buckets.
 *  - Everything else (not pinned, no future lastContactedAt) buckets by
 *    days-since-contact into: due (30-59), overdue (60-89), critical (90+).
 *  - Each bucket sorted oldest-first (most overdue top).
 *  - Cards without any time signal (no createdAt AND no lastContactedAt)
 *    are ignored — we have nothing to rank them by.
 *  - Soft-deleted cards are ignored.
 */
export function bucketFollowups(cards: CardSummary[], now: Date): FollowupGroups {
  const critical: FollowupBucket["cards"] = [];
  const overdue: FollowupBucket["cards"] = [];
  const due: FollowupBucket["cards"] = [];
  const pinnedStale: FollowupBucket["cards"] = [];

  for (const card of cards) {
    if (card.deletedAt) continue;
    const days = daysSinceContact(card, now);
    if (days === null) continue;

    if (card.isPinned) {
      if (days >= 30) pinnedStale.push({ card, days });
      continue;
    }

    if (days >= 90) critical.push({ card, days });
    else if (days >= 60) overdue.push({ card, days });
    else if (days >= 30) due.push({ card, days });
  }

  // Most overdue first in each bucket; id tiebreak for determinism.
  const compare = (
    a: { card: CardSummary; days: number },
    b: { card: CardSummary; days: number },
  ) => b.days - a.days || a.card.id.localeCompare(b.card.id);
  critical.sort(compare);
  overdue.sort(compare);
  due.sort(compare);
  pinnedStale.sort(compare);

  return {
    critical: {
      id: "critical",
      title: "嚴重過期",
      description: "超過 90 天沒聯絡。若還想維繫，這週就動。",
      cards: critical,
    },
    overdue: {
      id: "overdue",
      title: "過期",
      description: "60-89 天沒聯絡。簡單一句「最近好嗎」就夠。",
      cards: overdue,
    },
    due: {
      id: "due",
      title: "該追蹤",
      description: "30-59 天沒聯絡，建議本週內接觸。",
      cards: due,
    },
    pinnedStale: {
      id: "pinnedStale",
      title: "重要聯絡人 · 該 ping 了",
      description: "你標為重要的聯絡人，30 天以上沒互動。",
      cards: pinnedStale,
    },
  };
}

/**
 * Total count across all buckets — used to show the "all caught up"
 * empty state.
 */
export function totalFollowups(groups: FollowupGroups): number {
  return (
    groups.critical.cards.length +
    groups.overdue.cards.length +
    groups.due.cards.length +
    groups.pinnedStale.cards.length
  );
}

/**
 * Cards with an explicit followUpAt scheduled for today or earlier.
 * This is conceptually distinct from staleness-based buckets — these
 * are reminders the user committed to. Not soft-deleted; "today" =
 * end-of-day in the caller-supplied `now`'s local representation, so
 * a midnight-stored Date for the current calendar day still counts.
 *
 * Days = days-since-last-contact (so the row UX is consistent with the
 * other buckets, which all show "N 天" of staleness).
 */
export function dueRemindersToday(
  cards: CardSummary[],
  now: Date,
): Array<{ card: CardSummary; days: number }> {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const out: Array<{ card: CardSummary; days: number }> = [];
  for (const card of cards) {
    if (card.deletedAt) continue;
    if (!card.followUpAt) continue;
    if (card.followUpAt.getTime() > endOfToday.getTime()) continue;
    // Use staleness if available, fall back to 0 so a never-contacted
    // scheduled reminder still renders sensibly.
    const days = daysSinceContact(card, now) ?? 0;
    out.push({ card, days });
  }
  // Most-overdue reminder first, then deterministic id tiebreak.
  out.sort(
    (a, b) =>
      (a.card.followUpAt?.getTime() ?? 0) - (b.card.followUpAt?.getTime() ?? 0) ||
      a.card.id.localeCompare(b.card.id),
  );
  return out;
}

/**
 * Composite count: staleness buckets + scheduled reminders due today.
 * Used by the home/cards/AppShell urgency chips and per-group badges
 * on /companies and /events. Single source of truth for "how many
 * action items does this slice of cards represent right now?".
 */
export function countFollowupsInCards(cards: CardSummary[], now: Date): number {
  return totalFollowups(bucketFollowups(cards, now)) + dueRemindersToday(cards, now).length;
}

/**
 * Cards with followUpAt strictly after end-of-today and within
 * `windowDays` (default 7) inclusive. Used for /followups 「下週提醒」 —
 * gives business users a glance at their upcoming week without
 * doubling-up with 今日提醒 (which covers today and earlier).
 *
 * Sorted ascending by followUpAt (soonest first), then id tiebreak.
 */
export function upcomingRemindersThisWeek(
  cards: CardSummary[],
  now: Date,
  windowDays = 7,
): Array<{ card: CardSummary; days: number }> {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWindow = new Date(endOfToday);
  endOfWindow.setDate(endOfWindow.getDate() + windowDays);

  const out: Array<{ card: CardSummary; days: number }> = [];
  for (const card of cards) {
    if (card.deletedAt) continue;
    if (!card.followUpAt) continue;
    const t = card.followUpAt.getTime();
    if (t <= endOfToday.getTime()) continue; // already in dueRemindersToday
    if (t > endOfWindow.getTime()) continue; // outside the week window
    const days = daysSinceContact(card, now) ?? 0;
    out.push({ card, days });
  }
  out.sort(
    (a, b) =>
      (a.card.followUpAt?.getTime() ?? 0) - (b.card.followUpAt?.getTime() ?? 0) ||
      a.card.id.localeCompare(b.card.id),
  );
  return out;
}
