/**
 * Build a Google Calendar event-edit URL that opens with a pre-filled
 * all-day event on `dateYmd` (YYYY-MM-DD).
 *
 * Google Calendar's `dates` param format is `YYYYMMDD/YYYYMMDD` for an
 * all-day event, where the end date is EXCLUSIVE (so a one-day event
 * uses start = the day, end = next day).
 *
 * Cross-platform: Google Calendar URL works in any browser. iOS Safari
 * users see a "Open in Calendar app" prompt that imports it as an iCal
 * event — gives us coverage without per-platform branching.
 */
export function googleCalendarEventUrl(opts: {
  title: string;
  dateYmd: string; // YYYY-MM-DD
  details?: string;
}): string {
  const start = opts.dateYmd.replace(/-/g, "");
  const end = nextDayCompact(opts.dateYmd);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${start}/${end}`,
  });
  if (opts.details) params.set("details", opts.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Add 1 day to a YYYY-MM-DD string and return YYYYMMDD (compact, no
 * dashes — Google Calendar's dates param shape).
 */
function nextDayCompact(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd.replace(/-/g, "");
  const [, y, mo, d] = m;
  // Use UTC arithmetic so timezone doesn't shift the day-after.
  const start = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  start.setUTCDate(start.getUTCDate() + 1);
  const yy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(start.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}
