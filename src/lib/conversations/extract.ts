/**
 * 對話速記 — turn a free-form sentence about a meeting/chat into the
 * minimum tuple we need to call `logContactEvent`:
 *   { personName, summary }
 *
 * Date inference ("yesterday", "last week") is intentionally out of scope
 * for v1 — server defaults to `now`. Adding it later only changes the
 * server action, not this parser.
 *
 * Mirrors src/lib/voice/extract.ts: prompt + defensive JSON parse +
 * length clamps + fence stripping. Kept side-effect free so tests can
 * exercise it without mocks.
 */

const SYSTEM_PROMPT =
  "你是對話記錄抽取器。" +
  "使用者剛剛和某人講完話，用一句話描述見面/通話的內容。" +
  "把這句話拆成兩件事：(1) 對方是誰 (2) 聊了什麼。\n" +
  "回答必須是合法 JSON：\n" +
  "{\n" +
  '  "personName": string,   // 對方的名字（中文或英文皆可，原樣保留）\n' +
  '  "summary": string       // 聊天內容精華，繁體中文，<= 300 字\n' +
  "}\n" +
  "規則：\n" +
  "- 只回傳 JSON，不要 markdown 圍欄、不要說明文字。\n" +
  "- personName 必填。如果原句沒有明確人名（只說「他」「那個 PM」），回傳空字串。\n" +
  "- summary 必填。沒明確內容就用整句話濃縮版。\n" +
  "- 不要編造對方說過的具體事；只根據輸入推理。\n" +
  '- 不要把時間詞（"今天"、"剛剛"）放進 summary，那是 metadata。';

export interface ExtractedConversation {
  personName: string;
  summary: string;
}

export function buildConversationMessages(
  text: string,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
}

const MAX_NAME_LEN = 100;
const MAX_SUMMARY_LEN = 500;

function sanitizeStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Parse the LLM JSON. Returns null if:
 *   - input is not parseable JSON
 *   - root isn't an object (array / primitive)
 *   - personName is missing or non-string-after-trim
 *
 * If summary is missing, falls back to the truncated original input so
 * the contact-event still has *something* useful — better than dropping
 * the whole call. UI can let the user edit before saving.
 */
export function parseConversationLog(
  raw: string,
  fallbackText: string,
): ExtractedConversation | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1]! : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const personName = sanitizeStr(obj.personName, MAX_NAME_LEN);
  if (!personName) return null;

  const summary = sanitizeStr(obj.summary, MAX_SUMMARY_LEN);
  if (summary) {
    return { personName, summary };
  }
  const fallback = fallbackText.trim().slice(0, MAX_SUMMARY_LEN);
  return { personName, summary: fallback || "（對話）" };
}
