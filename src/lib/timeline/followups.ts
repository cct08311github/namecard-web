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
