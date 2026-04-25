import type { RecapItem } from "@/lib/recap/group";

export interface ActionItem {
  /** ID of the card the action refers to. Validated against the input set. */
  cardId: string;
  /** Short verb-led description of what the user promised. zh-Hant. ≤120 chars. */
  action: string;
  /** Optional time hint extracted from the original note ("週五前"、"下週"). */
  dueHint?: string;
}

const MAX_ITEMS = 5;
const MAX_ACTION_LEN = 120;
const MAX_DUE_HINT_LEN = 30;

const SYSTEM_PROMPT =
  "你是商務 action item 抽取器。" +
  "使用者最近的對話紀錄如下，每筆是「跟某人聊」的內容。" +
  "從中抽出 *使用者本人* 答應要做、但還沒做的事情（promise / commitment / TODO）。" +
  "例如「答應寄 pitch deck」、「他要我介紹 X」、「下週給報價」。\n" +
  "回答必須是合法 JSON：\n" +
  "{\n" +
  '  "items": [\n' +
  '    { "cardId": string, "action": string, "dueHint"?: string }\n' +
  "  ]\n" +
  "}\n" +
  "規則：\n" +
  "- 只回傳 JSON，不要 markdown 圍欄、不要任何說明文字。\n" +
  "- cardId 必須完全對應使用者提供的卡片 ID（每筆 RecapItem 開頭會給）。\n" +
  "- action 用繁體中文，動詞開頭，1 句話 ≤120 字（不含 dueHint）。\n" +
  "- 只抽 *使用者本人答應的事*；對方答應你的事不算。\n" +
  "- 沒有承諾性語句的對話 → 不要硬擠 action item。\n" +
  "- 最多 5 筆，挑最具體 / 最緊迫的。\n" +
  "- dueHint 是時間提示（「週五前」「下週」「月底」），原文沒寫就 omit。";

function pickName(card: RecapItem["card"]): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

export function buildActionItemsMessages(
  items: readonly RecapItem[],
): Array<{ role: "system" | "user"; content: string }> {
  const lines: string[] = [];
  lines.push("最近對話紀錄（每筆開頭是 cardId，務必完全對應使用）：");
  lines.push("");
  for (const it of items) {
    const date = it.event.at && it.event.at.getTime() > 0 ? formatLocalDate(it.event.at) : "";
    const name = pickName(it.card);
    const note = it.event.note?.trim() || "（無內容）";
    lines.push(`cardId=${it.card.id} | ${date} | 跟 ${name} 聊：${note}`);
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function sanitizeStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Parse the LLM's JSON. Defensive: drops items whose cardId is not in
 * the validIds set (anti-hallucination), drops items missing action,
 * caps at MAX_ITEMS, clamps action/dueHint lengths.
 */
export function parseActionItems(raw: string, validCardIds: ReadonlySet<string>): ActionItem[] {
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
  const itemsRaw = (parsed as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) return [];

  const out: ActionItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const cardId = sanitizeStr(obj.cardId, 200);
    if (!cardId || !validCardIds.has(cardId)) continue;
    const action = sanitizeStr(obj.action, MAX_ACTION_LEN);
    if (!action) continue;
    const dueHint = sanitizeStr(obj.dueHint, MAX_DUE_HINT_LEN);
    out.push(dueHint ? { cardId, action, dueHint } : { cardId, action });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Cache marker — flips when item set or freshest event timestamp changes. */
export function actionItemsCacheMarker(items: readonly RecapItem[]): string {
  if (items.length === 0) return "empty";
  const maxAt = items.reduce((acc, it) => Math.max(acc, it.event.at?.getTime() ?? 0), 0);
  return `n=${items.length}::max=${maxAt}`;
}
