import type { RecapItem } from "./group";

const SYSTEM_PROMPT =
  "你是商務人脈本週主題抽取器。" +
  "使用者最近 14 天的對話速記如下，每筆是一段你跟某人的對話內容。" +
  "把這些對話的主題抽成 3 到 5 個短標籤（每個標籤 2-12 個中文字），讓 user 一眼看出自己最近在談什麼。\n" +
  "回答必須是合法 JSON：\n" +
  '{"themes": ["標籤一", "標籤二", "標籤三"]}\n' +
  "規則：\n" +
  "- 只回傳 JSON，不要 markdown 圍欄、不要任何說明文字。\n" +
  "- themes 是 array of string。\n" +
  "- 標籤要*具體*：「AI 政策」、「SaaS 估值」、「demo day」優於「商務」「科技」這種空泛詞。\n" +
  "- 用繁體中文，避免 emoji。\n" +
  "- 不要超過 5 個；少於 3 個對話時可以只回 1-2 個。";

export function buildThemesMessages(
  items: readonly RecapItem[],
): Array<{ role: "system" | "user"; content: string }> {
  const lines = items.map((it, i) => {
    const name = it.card.nameZh || it.card.nameEn || `（人 ${i + 1}）`;
    return `${i + 1}. 跟 ${name} 聊：${it.event.note}`;
  });
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

const MAX_THEMES = 5;
const MAX_THEME_LEN = 30;
const MIN_THEME_LEN = 1;

/**
 * Defensive parser. Drops empty/oversize/non-string entries; caps total
 * count. Returns [] on any structural failure.
 */
export function parseThemes(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1]! : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const themes = (parsed as { themes?: unknown }).themes;
  if (!Array.isArray(themes)) return [];

  const out: string[] = [];
  for (const item of themes) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (value.length < MIN_THEME_LEN || value.length > MAX_THEME_LEN) continue;
    out.push(value);
    if (out.length >= MAX_THEMES) break;
  }
  return out;
}

/**
 * Cache marker that flips whenever the underlying recap items change —
 * either the list shrinks/grows or a new event timestamp pushes the
 * latest forward. Stable across no-op page reloads so /recap doesn't
 * burn LLM credits when nothing has changed since this morning.
 */
export function themesCacheMarker(items: readonly RecapItem[]): string {
  if (items.length === 0) return "empty";
  const maxAt = items.reduce((acc, it) => Math.max(acc, it.event.at?.getTime() ?? 0), 0);
  return `n=${items.length}::max=${maxAt}`;
}
