/**
 * Heuristic parser for the /prep meeting-attendees text box. Goal is
 * to handle the messy free-form input business users actually paste:
 *   "明天 3pm 跟 Karen Chen, Tom Lee 開會"
 *   "tomorrow at 3pm: Karen, Tom from GreenLeaf"
 *   "與 陳玉涵, 王小明 喝咖啡"
 *
 * Steps:
 *   1. Strip leading time/date phrases ("明天 3pm:", "tomorrow at 3pm")
 *      so they don't pollute the candidate list.
 *   2. Split on common attendee separators (commas, fullwidth commas,
 *      semicolons, "和", "與", "and", "with", line breaks, "+").
 *   3. Strip filler tokens that aren't names ("from", "的", role/company
 *      tails after "from"/"@"/"at").
 *   4. Drop too-short tokens (<2 chars after trim), URLs, pure numbers.
 *
 * No LLM. No I/O. Pure function returns the cleaned candidate names in
 * input order, deduplicated case-insensitively.
 */
const SPLIT_PATTERN = /[,，、;；\n+]+|\s+(?:和|與|跟|及|還有|and|with)\s+/gi;
// Time markers must look unambiguously time-like: a date word, AM/PM,
// hh:mm, or "Nam"/"Npm". Bare digits don't count (otherwise "Karen, 2026"
// would lose "Karen, 20" as a "time prefix").
const TIME_PREFIX_PATTERN =
  /^(?:[^：:\n]{0,20}?(?:今天|明天|昨天|tomorrow|today|yesterday|早上|上午|下午|晚上|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\s*)+[：:]\s*/i;
const URL_PATTERN = /^(?:https?:\/\/|www\.|[\w.-]+@[\w.-]+)/i;
const PURE_NUMBER = /^[\d\s\-\/]+$/;
const ROLE_TAIL_SEPARATOR = /\s+(?:from|@|at|的)\s+.+$/i;
const MIN_NAME_LEN = 2;
// Standalone time words that aren't real attendees — drop them even
// when the colon-anchored TIME_PREFIX_PATTERN didn't strip them.
const TIME_WORD = new Set([
  "今天",
  "明天",
  "昨天",
  "今早",
  "今晚",
  "上午",
  "下午",
  "早上",
  "晚上",
  "tomorrow",
  "today",
  "yesterday",
  "morning",
  "afternoon",
  "evening",
  "tonight",
]);

export function extractAttendeeNames(text: string): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const stripped = trimmed.replace(TIME_PREFIX_PATTERN, "");
  // Also strip any "with" / "跟" / "與" leading word if that's the
  // first token — common after the date strip.
  const cleaned = stripped.replace(/^(?:跟|與|和|with|along with)\s+/i, "");

  const tokens = cleaned
    .split(SPLIT_PATTERN)
    .map((t) => t.trim())
    .map((t) => t.replace(ROLE_TAIL_SEPARATOR, "").trim())
    .filter((t) => isPlausibleName(t));

  // Dedup case-insensitively, preserve first occurrence.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of tokens) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function isPlausibleName(token: string): boolean {
  if (token.length < MIN_NAME_LEN) return false;
  if (URL_PATTERN.test(token)) return false;
  if (PURE_NUMBER.test(token)) return false;
  if (TIME_WORD.has(token.toLowerCase())) return false;
  // Reject sentences (>30 chars or contains terminal punctuation) — those
  // are usually meeting-topic prose, not attendee names.
  if (token.length > 30) return false;
  if (/[。.!?！？]/.test(token)) return false;
  return true;
}
