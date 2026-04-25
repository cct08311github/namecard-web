import { createHash } from "node:crypto";

import type { CardSummary } from "@/db/cards";
import type { ContactEvent } from "@/db/cards";

export interface CoachContext {
  card: CardSummary;
  /** Up to 10 most-recent contact events for this card. */
  events: ContactEvent[];
  /** Other cards at the same company (excludes the focal card). */
  companyMates: CardSummary[];
  /** Other cards met at the same event (excludes the focal card). */
  eventMates: CardSummary[];
  /** Reference "now" so prompt is reproducible in tests. */
  now: Date;
}

export interface CoachInsight {
  /** 3-5 conversation starters for the next interaction. */
  conversationStarters: string[];
  /** What this person likely cares about right now (inferred). */
  inferredNeeds: string[];
  /** Concrete actions the user can take this week. */
  suggestedActions: string[];
}

const MAX_CONVERSATION = 5;
const MAX_NEEDS = 4;
const MAX_ACTIONS = 4;
const MAX_ITEM_LEN = 200;

function pickName(c: CardSummary): string {
  return c.nameZh || c.nameEn || "（未命名）";
}

function pickRole(c: CardSummary): string {
  return c.jobTitleZh || c.jobTitleEn || "";
}

function pickCompany(c: CardSummary): string {
  return c.companyZh || c.companyEn || "";
}

function daysSince(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  const ms = now.getTime() - date.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function formatYmd(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Stable, deterministic hash of the inputs that influence the LLM
 * response. Used as the cache key so re-opening the same card with no
 * data change reuses the cached insight (cheap LLM bill).
 */
export function contextHash(ctx: CoachContext): string {
  const stable = {
    cardId: ctx.card.id,
    name: pickName(ctx.card),
    role: pickRole(ctx.card),
    company: pickCompany(ctx.card),
    why: ctx.card.whyRemember ?? "",
    firstMet: ctx.card.firstMetDate ?? "",
    eventTag: ctx.card.firstMetEventTag ?? "",
    notes: ctx.card.notes ?? "",
    daysSinceContact: daysSince(ctx.card.lastContactedAt, ctx.now),
    eventIds: ctx.events
      .map((e) => `${e.id}:${e.note.slice(0, 80)}`)
      .sort()
      .join("|"),
    companyMates: ctx.companyMates
      .map((c) => `${pickName(c)}/${pickRole(c)}`)
      .sort()
      .join("|"),
    eventMates: ctx.eventMates
      .map((c) => `${pickName(c)}/${pickCompany(c)}`)
      .sort()
      .join("|"),
  };
  const json = JSON.stringify(stable);
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}

/**
 * Build the structured prompt sent to the LLM. Pure function — no
 * fetch, no env, no I/O. Easy to snapshot-test.
 */
export function buildCoachPrompt(ctx: CoachContext): string {
  const c = ctx.card;
  const lines: string[] = [];
  lines.push("=== 名片基本資料 ===");
  lines.push(`姓名：${pickName(c)}`);
  if (pickRole(c)) lines.push(`職稱：${pickRole(c)}`);
  if (pickCompany(c)) lines.push(`公司：${pickCompany(c)}`);
  if (c.department) lines.push(`部門：${c.department}`);

  if (c.whyRemember) {
    lines.push("");
    lines.push("=== 為什麼記得這個人 ===");
    lines.push(c.whyRemember);
  }

  if (c.firstMetDate || c.firstMetEventTag || c.firstMetContext) {
    lines.push("");
    lines.push("=== 第一次見面 ===");
    if (c.firstMetDate) lines.push(`日期：${c.firstMetDate}`);
    if (c.firstMetEventTag) lines.push(`場合：${c.firstMetEventTag}`);
    if (c.firstMetContext) lines.push(`情境：${c.firstMetContext}`);
  }

  if (c.notes) {
    lines.push("");
    lines.push("=== 備註 ===");
    lines.push(c.notes);
  }

  const days = daysSince(c.lastContactedAt, ctx.now);
  if (days !== null) {
    lines.push("");
    lines.push(`=== 互動狀態 ===`);
    lines.push(
      `上次互動：${formatYmd(c.lastContactedAt)}（${days} 天前${days >= 90 ? "，已超過 90 天" : ""}）`,
    );
  } else if (c.firstMetDate) {
    lines.push("");
    lines.push("=== 互動狀態 ===");
    lines.push("尚未記錄任何互動 — 自首次見面後沒有 follow-up 紀錄");
  }

  if (ctx.events.length > 0) {
    lines.push("");
    lines.push("=== 近期互動歷史（新→舊） ===");
    for (const e of ctx.events.slice(0, 6)) {
      const note = e.note?.trim() || "（無備註）";
      lines.push(`- ${formatYmd(e.at)}：${note.slice(0, 200)}`);
    }
  }

  if (ctx.companyMates.length > 0) {
    lines.push("");
    lines.push(`=== 同公司其他聯絡人（${ctx.companyMates.length} 位） ===`);
    for (const m of ctx.companyMates.slice(0, 6)) {
      const role = pickRole(m);
      lines.push(`- ${pickName(m)}${role ? `（${role}）` : ""}`);
    }
  }

  if (ctx.eventMates.length > 0) {
    lines.push("");
    lines.push(`=== 同場合認識的人（${ctx.eventMates.length} 位） ===`);
    for (const m of ctx.eventMates.slice(0, 6)) {
      const co = pickCompany(m);
      lines.push(`- ${pickName(m)}${co ? `（${co}）` : ""}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "你是一位資深商務人脈教練，專長是幫助使用者經營一對一的商務關係。" +
  "根據使用者提供的名片內容、互動歷史、公司同事、同場合認識的人，給出三段 actionable 建議。" +
  "回答必須是合法的 JSON，符合下列 schema，不要任何其他文字、不要 markdown 圍欄：\n" +
  '{"conversationStarters": string[], "inferredNeeds": string[], "suggestedActions": string[]}\n' +
  "規則：\n" +
  "- conversationStarters：3-5 個下次聯絡可以聊的具體話題。每點一句話內，要有具體 hook（提到 whyRemember 或互動歷史的關鍵字、或同公司同事/同場合認識的人）。\n" +
  "- inferredNeeds：2-4 個推測這個人現在可能在意的事，根據職稱、公司、產業、互動歷史推理。\n" +
  "- suggestedActions：2-4 個使用者本週可以做的具體動作。第一個應該是「現在就能寄／傳訊息／打電話」的小動作；其它可以是中期的（介紹某人、分享某文章、邀某活動）。\n" +
  "- 用繁體中文回答（除非名字或專有名詞英文）。\n" +
  "- 每點 200 字內。具體勝過抽象。\n" +
  "- 沒有資料的領域不要強行編造（例：沒有互動歷史就別假裝有）。";

export function buildLlmMessages(
  ctx: CoachContext,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildCoachPrompt(ctx) },
  ];
}

function sanitizeStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_ITEM_LEN));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Parse the LLM's JSON response into a structured CoachInsight. Defensive:
 * any malformed input → empty arrays so the UI degrades cleanly.
 */
export function parseCoachResponse(raw: string): CoachInsight {
  const empty: CoachInsight = {
    conversationStarters: [],
    inferredNeeds: [],
    suggestedActions: [],
  };
  if (!raw) return empty;
  const trimmed = raw.trim();
  // Strip optional markdown fence the LLM may add despite instructions.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1]! : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const obj = parsed as Record<string, unknown>;
  return {
    conversationStarters: sanitizeStringArray(obj.conversationStarters, MAX_CONVERSATION),
    inferredNeeds: sanitizeStringArray(obj.inferredNeeds, MAX_NEEDS),
    suggestedActions: sanitizeStringArray(obj.suggestedActions, MAX_ACTIONS),
  };
}

export function isEmptyInsight(insight: CoachInsight): boolean {
  return (
    insight.conversationStarters.length === 0 &&
    insight.inferredNeeds.length === 0 &&
    insight.suggestedActions.length === 0
  );
}
