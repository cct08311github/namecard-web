import type { CardSummary, ContactEvent } from "@/db/cards";

const SYSTEM_PROMPT =
  "你是一個個人關係助理。" +
  "使用者會問你關於某位聯絡人的問題，你只能根據以下提供的卡片資料 + 對話紀錄回答。" +
  "嚴格規則：\n" +
  "- 只用提供的 context 回答；context 沒寫的事不要編造、不要推測該人的私生活/政治立場/八卦。\n" +
  "- 如果 context 不足以回答，就直接說「資料中沒有提到」+ 建議下一步可問什麼。\n" +
  "- 用繁體中文，1-3 句話內回完，避免冗長。\n" +
  "- 不要 markdown 標題、不要 bullet、不要圍欄；純文字段落。\n" +
  "- 回答前先確認問題是不是真的關於這個人；若不是，禮貌地請使用者把問題聚焦回這個人。";

export interface CardChatContext {
  card: CardSummary;
  events: readonly ContactEvent[];
}

function pickName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d || d.getTime() <= 0) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function buildChatMessages(
  ctx: CardChatContext,
  question: string,
): Array<{ role: "system" | "user"; content: string }> {
  const card = ctx.card;
  const lines: string[] = [];

  lines.push("=== 聯絡人卡片 ===");
  lines.push(`姓名: ${pickName(card)}`);
  if (card.nameEn && card.nameZh) lines.push(`英文名: ${card.nameEn}`);
  const role = card.jobTitleZh || card.jobTitleEn;
  if (role) lines.push(`職稱: ${role}`);
  const company = card.companyZh || card.companyEn;
  if (company) lines.push(`公司: ${company}`);
  if (card.department) lines.push(`部門: ${card.department}`);
  if (card.firstMetEventTag) lines.push(`認識場合: ${card.firstMetEventTag}`);
  if (card.firstMetDate) lines.push(`首次見面: ${card.firstMetDate}`);
  if (card.firstMetContext) lines.push(`認識情境: ${card.firstMetContext}`);
  lines.push(`為什麼記得: ${card.whyRemember}`);
  if (card.notes) lines.push(`備註: ${card.notes}`);
  const last = isoDate(card.lastContactedAt);
  if (last) lines.push(`上次互動: ${last}`);

  if (ctx.events.length > 0) {
    lines.push("");
    lines.push(`=== 最近對話紀錄（最新在前，共 ${ctx.events.length} 筆）===`);
    for (const e of ctx.events) {
      const day = isoDate(e.at);
      if (!day) continue;
      const note = e.note?.trim() || "（無備註）";
      lines.push(`- ${day}: ${note}`);
    }
  } else {
    lines.push("");
    lines.push("=== 最近對話紀錄 ===\n（還沒有 log 任何對話）");
  }

  lines.push("");
  lines.push("=== 問題 ===");
  lines.push(question.trim());

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

const MAX_ANSWER_LEN = 1500;

/**
 * Permissive parser. The chat reply isn't structured JSON — it's free
 * prose. We strip stray markdown fences (some models still wrap), trim,
 * and clamp. Returns "" on empty / non-string so callers can branch.
 */
export function parseChatAnswer(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const fenced = trimmed.match(/^```(?:\w*)?\s*([\s\S]*?)\s*```$/);
  const inner = fenced ? fenced[1]!.trim() : trimmed;
  return inner.slice(0, MAX_ANSWER_LEN);
}
