import type { CardSummary } from "@/db/cards";

export interface AnniversaryEntry {
  card: CardSummary;
  /** Whole-year count since firstMetDate, computed at the local "now" date. */
  years: number;
}

/**
 * Match `YYYY-MM-DD`. Year may be < 4 digits in user data; we accept
 * 4-digit years only and bail otherwise (categorize.ts uses the same
 * regex — keep the bar consistent).
 */
function parseFirstMet(
  raw: string | undefined,
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Find cards whose `firstMetDate` matches today's month + day across any
 * prior year. Excludes:
 *   - soft-deleted
 *   - missing or malformed firstMetDate
 *   - firstMet year >= now year (no anniversary on the same year you met)
 *   - "leap day" Feb 29 mismatch — Feb 29 anniversaries surface on Feb 28
 *     in non-leap years (closest analog without skipping anyone)
 *
 * Sorted by years desc (5-year > 3-year > 1-year) so the bigger
 * milestone leads. Tiebreak on card name for stability.
 */
export function findAnniversariesToday(
  cards: readonly CardSummary[],
  now: Date,
): AnniversaryEntry[] {
  const todayMonth = now.getMonth() + 1; // 1..12
  const todayDay = now.getDate(); // 1..31
  const todayYear = now.getFullYear();
  const isFeb28InNonLeapYear = todayMonth === 2 && todayDay === 28 && !isLeapYear(todayYear);

  const out: AnniversaryEntry[] = [];
  for (const card of cards) {
    if (card.deletedAt) continue;
    const parsed = parseFirstMet(card.firstMetDate);
    if (!parsed) continue;
    if (parsed.year >= todayYear) continue;

    const matchesToday = parsed.month === todayMonth && parsed.day === todayDay;
    // On Feb 28 in non-leap years, also surface Feb 29 anniversaries.
    const matchesFeb29Today = isFeb28InNonLeapYear && parsed.month === 2 && parsed.day === 29;

    if (!matchesToday && !matchesFeb29Today) continue;

    const years = todayYear - parsed.year;
    if (years < 1) continue;
    out.push({ card, years });
  }

  out.sort((a, b) => {
    if (a.years !== b.years) return b.years - a.years;
    const an = (a.card.nameZh ?? a.card.nameEn ?? a.card.id).toString();
    const bn = (b.card.nameZh ?? b.card.nameEn ?? b.card.id).toString();
    return an.localeCompare(bn);
  });
  return out;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
