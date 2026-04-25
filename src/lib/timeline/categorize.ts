import type { CardSummary } from "@/db/cards";

export interface TimelineSection {
  id: "due-today" | "pinned" | "uncontacted" | "met-this-month" | "newly-added";
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
 * Categorize cards into the 5 timeline sections.
 * Priority: due-today > pinned > met-this-month > newly-added > uncontacted.
 * A card shows in only one section. due-today wins over pinned because
 * the user *committed to acting today* — that beats the standing pin.
 *
 * Rules:
 *  - due-today: followUpAt is set AND <= end of `now` calendar day
 *  - pinned: card.isPinned === true (and not due-today)
 *  - met-this-month: firstMetDate within the given "now" month.
 *  - newly-added: createdAt within newlyAddedDays (default 7). Excluded from uncontacted.
 *  - uncontacted:
 *      - lastContactedAt older than uncontactedDays (default 30), OR
 *      - lastContactedAt is null AND createdAt older than uncontactedDays
 *      - excludes cards already in another section
 *  - Each section capped by maxPerSection (default 5), sorted deterministically.
 */
export function categorizeTimeline(
  cards: CardSummary[],
  options: CategorizeOptions,
): TimelineSection[] {
  const { now, uncontactedDays = 30, newlyAddedDays = 7, maxPerSection = 5 } = options;

  // End-of-day: include reminders set for *today* even if their stored
  // midnight is technically already past at the time of read.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const dueToday: CardSummary[] = [];
  const pinned: CardSummary[] = [];
  const metThisMonth: CardSummary[] = [];
  const newlyAdded: CardSummary[] = [];
  const uncontacted: CardSummary[] = [];

  for (const card of cards) {
    if (card.deletedAt) continue;
    if (card.followUpAt && card.followUpAt.getTime() <= endOfToday.getTime()) {
      dueToday.push(card);
      continue;
    }
    if (card.isPinned) {
      pinned.push(card);
      continue;
    }
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

  // Pinned sorted by most-recently-touched so the top row feels alive.
  pinned.sort((a, b) => {
    const ta = a.updatedAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
    const tb = b.updatedAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
    return tb - ta;
  });

  // Due-today sorted by overdue-most-first so the most pressing reminders
  // surface first.
  dueToday.sort((a, b) => {
    const ta = a.followUpAt?.getTime() ?? 0;
    const tb = b.followUpAt?.getTime() ?? 0;
    return ta - tb;
  });

  return [
    {
      id: "due-today",
      title: "今天該聯絡",
      description: "你之前設定提醒到期了，趁今天打通電話 / 寄個訊息。",
      // Not capped — every due reminder must be visible, otherwise the
      // whole feature loses trust.
      cards: dueToday,
    },
    {
      id: "pinned",
      title: "重要聯絡人",
      description: "核心圈，永遠放在最上方。",
      // Pinned intentionally not capped — user curates this list themselves.
      cards: pinned,
    },
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
