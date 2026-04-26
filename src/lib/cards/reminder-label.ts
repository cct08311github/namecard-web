/**
 * Short human label for an upcoming follow-up reminder row.
 *
 * Used by /followups (今日提醒 / 下週提醒) so each row shows a
 * planning-friendly cue ("今天" / "明天" / "4/29") instead of
 * the staleness-based "{days} 天" — those numbers don't help when
 * planning the future.
 *
 * Diff is computed by calendar-day, not raw 24h, so a reminder
 * for tomorrow morning and a reminder for tomorrow night both
 * say "明天".
 */
export function reminderDateLabel(followUpAt: Date, now: Date): string {
  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);
  const startOfReminder = new Date(followUpAt);
  startOfReminder.setHours(0, 0, 0, 0);

  const diffMs = startOfReminder.getTime() - startOfNow.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "明天";
  // No leading zeros — feels native in Traditional Chinese contexts.
  const month = followUpAt.getMonth() + 1;
  const day = followUpAt.getDate();
  return `${month}/${day}`;
}
