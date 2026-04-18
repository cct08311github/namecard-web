import type { CardSummary } from "@/db/cards";

export interface TimelineSection {
  id: "uncontacted" | "met-this-month" | "newly-added";
  title: string;
  description: string;
  cards: CardSummary[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface CategorizeOptions {
  now: Date;
  uncontactedDays?: number;
  newlyAddedDays?: number;
  maxPerSection?: number;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function parseFirstMetDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Categorize cards into the 3 timeline sections.
 * Rules:
 *  - met-this-month: firstMetDate within the given "now" month (exclusive of archive).
 *  - newly-added: createdAt within newlyAddedDays (default 7). Excluded from uncontacted.
 *  - uncontacted:
 *      - lastContactedAt older than uncontactedDays (default 30), OR
 *      - lastContactedAt is null AND createdAt older than uncontactedDays
 *      - excludes cards already in met-this-month or newly-added
 *  - Each section capped by maxPerSection (default 5), sorted deterministically.
 */
export function categorizeTimeline(
  cards: CardSummary[],
  options: CategorizeOptions,
): TimelineSection[] {
  const { now, uncontactedDays = 30, newlyAddedDays = 7, maxPerSection = 5 } = options;

  const metThisMonth: CardSummary[] = [];
  const newlyAdded: CardSummary[] = [];
  const uncontacted: CardSummary[] = [];

  for (const card of cards) {
    if (card.deletedAt) continue;
    const firstMet = parseFirstMetDate(card.firstMetDate);
    const createdAt = card.createdAt;
    const lastContactedAt = card.lastContactedAt;

    const isMetThisMonth = firstMet ? isSameMonth(firstMet, now) : false;
    const createdAgeDays = createdAt
      ? (now.getTime() - createdAt.getTime()) / MS_PER_DAY
      : Infinity;
    const isNewlyAdded = !isMetThisMonth && createdAgeDays <= newlyAddedDays;

    const lastTouchAgeDays = lastContactedAt
      ? (now.getTime() - lastContactedAt.getTime()) / MS_PER_DAY
      : createdAgeDays;
    const isUncontacted = !isMetThisMonth && !isNewlyAdded && lastTouchAgeDays >= uncontactedDays;

    if (isMetThisMonth) metThisMonth.push(card);
    else if (isNewlyAdded) newlyAdded.push(card);
    else if (isUncontacted) uncontacted.push(card);
  }

  // Sort: newly-added = createdAt desc; met-this-month = firstMetDate desc;
  //       uncontacted = last touch asc (stalest first).
  newlyAdded.sort((a, b) => {
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    return tb - ta;
  });
  metThisMonth.sort((a, b) => {
    const ta = parseFirstMetDate(a.firstMetDate)?.getTime() ?? 0;
    const tb = parseFirstMetDate(b.firstMetDate)?.getTime() ?? 0;
    return tb - ta;
  });
  uncontacted.sort((a, b) => {
    const ta = a.lastContactedAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
    const tb = b.lastContactedAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
    return ta - tb;
  });

  return [
    {
      id: "newly-added",
      title: "新建立",
      description: `最近 ${newlyAddedDays} 天手動建立或剛匯入。`,
      cards: newlyAdded.slice(0, maxPerSection),
    },
    {
      id: "met-this-month",
      title: "這個月認識",
      description: "本月份首次見面的人，趁記憶還熱保持聯絡。",
      cards: metThisMonth.slice(0, maxPerSection),
    },
    {
      id: "uncontacted",
      title: "最近沒聯絡",
      description: `已經 ${uncontactedDays} 天以上沒互動，可能該問候一下。`,
      cards: uncontacted.slice(0, maxPerSection),
    },
  ];
}
