import type { PriorityCandidate, PriorityReason } from "./priority";

export interface BriefingPick {
  cardId: string;
  /** 1-2 sentence reason in zh-Hant explaining why today is the right day. */
  reason: string;
  /** A single concrete suggested action ("寄一封 follow-up email", "打電話約下週咖啡"). */
  suggestedAction: string;
}

export interface DailyBriefing {
  /** ISO date the briefing was generated for (YYYY-MM-DD). */
  date: string;
  /** AI-curated top 3 picks (or fewer if fewer candidates). */
  picks: BriefingPick[];
}

const MAX_PICKS = 3;
const MAX_REASON_LEN = 220;
const MAX_ACTION_LEN = 120;

function reasonLabel(reason: PriorityReason, days: number | null): string {
  switch (reason) {
    case "followup-overdue":
      return `提醒已過期 ${days ?? "?"} 天`;
    case "followup-due-today":
      return "提醒到期今天";
    case "anniversary":
      return `${days ?? "?"} 年前的今天認識`;
    case "pinned-stale":
      return `重要聯絡人，已 ${days ?? "?"} 天沒互動`;
    case "uncontacted-long":
      return `已 ${days ?? "?"} 天沒互動`;
  }
}

function pickName(card: PriorityCandidate["card"]): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

/**
 * Build the prompt sent to the LLM. The candidates are pre-scored — the
 * LLM's job is to *narrow to 3* and *write the reason in human voice*,
 * not to do the prioritization math itself.
 */
export function buildBriefingPrompt(candidates: readonly PriorityCandidate[], today: Date): string {
  const dateStr = today.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`今天是 ${dateStr}。`);
  lines.push(`從以下 ${candidates.length} 位候選聯絡人中，挑 ${MAX_PICKS} 位最該今天聯絡的人。`);
  lines.push("");
  lines.push("=== 候選人（按系統評分排序，分數越高越急） ===");
  for (const c of candidates) {
    const card = c.card;
    const tags: string[] = [];
    tags.push(`評分=${c.score}`);
    tags.push(reasonLabel(c.reason, c.daysOffset));
    if (card.isPinned) tags.push("重要聯絡人");
    if (card.firstMetEventTag) tags.push(`場合=${card.firstMetEventTag}`);
    const company = card.companyZh || card.companyEn;
    const role = card.jobTitleZh || card.jobTitleEn;
    const header = `# ${pickName(card)}（${[role, company].filter(Boolean).join(" / ") || "—"}）`;
    lines.push("");
    lines.push(header);
    lines.push(`卡片 ID: ${card.id}`);
    lines.push(`狀態: ${tags.join(" · ")}`);
    if (card.whyRemember) lines.push(`為什麼記得: ${card.whyRemember}`);
    if (card.firstMetDate) lines.push(`首次見面: ${card.firstMetDate}`);
    if (card.lastContactedAt) {
      lines.push(`上次互動: ${card.lastContactedAt.toISOString().slice(0, 10)}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "你是商務人脈每日簡報官，幫使用者每天挑出最該聯絡的 3 位人。" +
  "從使用者提供的候選人中挑 3 位，根據他們的系統評分、為什麼記得、首次見面背景，" +
  "用一段 1-2 句的繁體中文 reason 解釋「今天為什麼該找他」，要具體、有 hook。" +
  "再給一個 suggestedAction（一個動詞開頭的具體動作，例如「寄一封 hello email + 問近況」）。\n" +
  "回答必須是合法 JSON，符合 schema：\n" +
  '{"picks": [{"cardId": string, "reason": string, "suggestedAction": string}]}\n' +
  "規則：\n" +
  "- 最多 3 位；如果候選人少於 3 位，就回傳全部。\n" +
  "- cardId 必須完全對應候選人的卡片 ID。\n" +
  "- reason 220 字內、suggestedAction 120 字內。\n" +
  "- 不要任何其他文字、不要 markdown 圍欄。";

export function buildBriefingMessages(
  candidates: readonly PriorityCandidate[],
  today: Date,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildBriefingPrompt(candidates, today) },
  ];
}

function sanitizeStr(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Parse the LLM JSON. Defensive: drops malformed picks, trims long
 * fields, caps at MAX_PICKS, validates cardId belongs to the
 * candidate set so the LLM can't fabricate IDs.
 */
export function parseBriefingResponse(
  raw: string,
  validCardIds: ReadonlySet<string>,
): BriefingPick[] {
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
  const picks = (parsed as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];

  const out: BriefingPick[] = [];
  for (const item of picks) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const cardId = sanitizeStr(obj.cardId, 200);
    if (!cardId || !validCardIds.has(cardId)) continue;
    const reason = sanitizeStr(obj.reason, MAX_REASON_LEN);
    const suggestedAction = sanitizeStr(obj.suggestedAction, MAX_ACTION_LEN);
    if (!reason || !suggestedAction) continue;
    out.push({ cardId, reason, suggestedAction });
    if (out.length >= MAX_PICKS) break;
  }
  return out;
}

/** Cache key for the daily briefing — stable for same date + candidate set. */
export function briefingCacheKey(date: Date, candidateIds: readonly string[]): string {
  const dateStr = date.toISOString().slice(0, 10);
  const sortedIds = [...candidateIds].sort().join(",");
  return `${dateStr}::${sortedIds}`;
}
