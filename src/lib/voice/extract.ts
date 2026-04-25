import type { CardCreateInput } from "@/db/schema";

export type ExtractedCard = Partial<CardCreateInput>;

const FIELD_SCHEMA =
  "{\n" +
  '  "nameZh"?: string,        // 中文姓名\n' +
  '  "nameEn"?: string,        // 英文姓名\n' +
  '  "jobTitleZh"?: string,    // 中文職稱\n' +
  '  "jobTitleEn"?: string,    // 英文職稱\n' +
  '  "companyZh"?: string,     // 中文公司\n' +
  '  "companyEn"?: string,     // 英文公司\n' +
  '  "department"?: string,    // 部門\n' +
  '  "firstMetEventTag"?: string,   // 認識場合，例如 2024 COMPUTEX\n' +
  '  "firstMetContext"?: string,    // 認識的情境細節\n' +
  '  "whyRemember": string,    // 「為什麼記得這個人」(必填，沒有就用整段話的精華)\n' +
  '  "notes"?: string\n' +
  "}";

const SYSTEM_PROMPT =
  "你是名片資訊抽取器。" +
  "使用者剛 networking event 結束，用自然語言描述他剛遇到的人。可能描述一個人，也可能一次描述好幾個人（「認識三個人：A 是…、B 是…、C 是…」）。" +
  "把這段話抽出結構化欄位。\n" +
  "回答必須是合法 JSON，schema：\n" +
  '{ "cards": [ <Card>, <Card>, ... ] }\n' +
  "其中 <Card> 是：\n" +
  FIELD_SCHEMA +
  "\n" +
  "規則：\n" +
  "- 只回傳 JSON，不要任何說明文字、不要 markdown 圍欄。\n" +
  "- 「cards」 是 *array*。一個人就回 length=1 的 array，多個人就回多個元素。\n" +
  "- 沒提到的欄位就 omit，不要填空字串。\n" +
  "- whyRemember 每張卡都 *必填*。沒有明確線索時，把該人提到的最有 hook 的一句當作 whyRemember。\n" +
  "- 中英文混雜的內容：name、jobTitle、company 各填到對應的中/英欄位。\n" +
  "- whyRemember 一定用繁體中文。\n" +
  "- 不要編造對方說過的具體事；只根據輸入推理。\n" +
  "- 共同 context（同個 event 場合）每張卡都帶上 firstMetEventTag。";

export function buildExtractMessages(
  text: string,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
}

const MAX_FIELD_LEN = 200;
const MAX_NOTES_LEN = 1000;
const MAX_WHY_LEN = 500;

function sanitizeStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function parseSingleCard(value: unknown, fallbackText: string): ExtractedCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  const out: ExtractedCard = {};
  const nameZh = sanitizeStr(obj.nameZh, MAX_FIELD_LEN);
  if (nameZh) out.nameZh = nameZh;
  const nameEn = sanitizeStr(obj.nameEn, MAX_FIELD_LEN);
  if (nameEn) out.nameEn = nameEn;
  const jobTitleZh = sanitizeStr(obj.jobTitleZh, MAX_FIELD_LEN);
  if (jobTitleZh) out.jobTitleZh = jobTitleZh;
  const jobTitleEn = sanitizeStr(obj.jobTitleEn, MAX_FIELD_LEN);
  if (jobTitleEn) out.jobTitleEn = jobTitleEn;
  const companyZh = sanitizeStr(obj.companyZh, MAX_FIELD_LEN);
  if (companyZh) out.companyZh = companyZh;
  const companyEn = sanitizeStr(obj.companyEn, MAX_FIELD_LEN);
  if (companyEn) out.companyEn = companyEn;
  const department = sanitizeStr(obj.department, MAX_FIELD_LEN);
  if (department) out.department = department;
  const firstMetEventTag = sanitizeStr(obj.firstMetEventTag, MAX_FIELD_LEN);
  if (firstMetEventTag) out.firstMetEventTag = firstMetEventTag;
  const firstMetContext = sanitizeStr(obj.firstMetContext, MAX_FIELD_LEN);
  if (firstMetContext) out.firstMetContext = firstMetContext;
  const notes = sanitizeStr(obj.notes, MAX_NOTES_LEN);
  if (notes) out.notes = notes;
  const why = sanitizeStr(obj.whyRemember, MAX_WHY_LEN);
  if (why) {
    out.whyRemember = why;
  } else {
    const fallback = fallbackText.trim().slice(0, MAX_WHY_LEN);
    out.whyRemember = fallback || "（剛認識）";
  }
  return out;
}

/**
 * Parse the LLM's JSON into a Partial<CardCreateInput>. Defensive:
 *   - strips markdown fences
 *   - drops non-string fields
 *   - clamps lengths
 *   - guarantees `whyRemember` is at least the truncated input if the
 *     LLM didn't pick one (the schema requires it; UI can edit before save)
 *
 * Backward-compat: if the LLM returns the new `{cards: [...]}` schema,
 * returns the *first* card (Phase 1 callers expect a single result).
 * Use `parseMultipleExtractedCards` for the multi-person flow.
 */
export function parseExtractedCard(raw: string, fallbackText: string): ExtractedCard | null {
  const all = parseMultipleExtractedCards(raw, fallbackText);
  return all.length > 0 ? all[0]! : null;
}

/**
 * Parse one or more cards from the LLM JSON. Accepts:
 *   - new shape: { cards: [...] }  (preferred — multi-card support)
 *   - legacy shape: { ...singleCard } (backward-compat with Phase 1)
 * Returns [] on malformed input or zero valid cards. Each card runs
 * through parseSingleCard which guarantees whyRemember (falls back to
 * truncated input).
 */
export function parseMultipleExtractedCards(raw: string, fallbackText: string): ExtractedCard[] {
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
  if (!parsed || typeof parsed !== "object") return [];

  // New shape: {cards: [...]}
  const root = parsed as { cards?: unknown };
  if (Array.isArray(root.cards)) {
    const out: ExtractedCard[] = [];
    for (const item of root.cards) {
      const card = parseSingleCard(item, fallbackText);
      if (card) out.push(card);
    }
    return out;
  }

  // Legacy single-card shape: {...fields}
  if (Array.isArray(parsed)) return [];
  const single = parseSingleCard(parsed, fallbackText);
  return single ? [single] : [];
}

/**
 * Encoder/decoder for passing the parsed card through a URL query
 * param. Base64-encoded JSON keeps the URL clean and survives a
 * full-page navigation to /cards/new.
 */
export function encodePrefill(card: ExtractedCard): string {
  const json = JSON.stringify(card);
  // Use base64url to be URL-safe without manual encoding.
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodePrefill(encoded: string | undefined | null): ExtractedCard | null {
  if (!encoded || typeof encoded !== "string") return null;
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // Rerun the same sanitizer over the decoded payload so a
    // hand-crafted URL can't smuggle huge / non-string values.
    const re = parseExtractedCard(JSON.stringify(parsed), "");
    return re && Object.keys(re).length > 0 ? re : null;
  } catch {
    return null;
  }
}
