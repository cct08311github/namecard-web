/**
 * YYYY-MM-DD in local time for `from + days`. We avoid `toISOString()`
 * because it's UTC — for users in TZ +08:00 a click at midnight would
 * subtract a calendar day. The "下一週" picker means "a week from
 * today in the user's timezone", not UTC.
 */
export function localYmdAfterDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
