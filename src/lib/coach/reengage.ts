import { createHash } from "node:crypto";

import type { CardSummary } from "@/db/cards";
import type { ContactEvent } from "@/db/cards";

export interface ReengageDrafts {
  /** LINE / WhatsApp 風格短訊。輕快，2-3 句。 */
  shortMessage: string;
  /** Email 版本，含 subject + body，正式 4-6 句。 */
  email: { subject: string; body: string };
  /** 「剛好想到你」自然偶遇式 hook，2-3 句。 */
  casualPing: string;
}

export interface ReengageContext {
  card: CardSummary;
  /** Up to 5 most-recent contact events (used for "你欠我什麼" hooks). */
  recentEvents: ContactEvent[];
  now: Date;
}

const MAX_SHORT_LEN = 280;
const MAX_EMAIL_SUBJECT_LEN = 120;
const MAX_EMAIL_BODY_LEN = 1200;
const MAX_CASUAL_LEN = 280;

function pickName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function pickRole(card: CardSummary): string {
  return card.jobTitleZh || card.jobTitleEn || "";
}

function pickCompany(card: CardSummary): string {
  return card.companyZh || card.companyEn || "";
}

function daysSince(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  const ms = now.getTime() - date.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function bucketDays(days: number | null): string {
  if (days === null) return "never";
  if (days <= 14) return "0-14d";
  if (days <= 30) return "15-30d";
  if (days <= 90) return "31-90d";
  if (days <= 180) return "91-180d";
  if (days <= 365) return "181-365d";
  return "365d+";
}

/**
 * Cache key — same card with similar staleness bucket → same drafts.
 * Day-precise hashing would burn LLM tokens for trivial 1-day shifts;
 * bucketing keeps drafts stable across a typical "I'll deal with this
 * tomorrow" window without going stale across months.
 */
export function reengageCacheKey(ctx: ReengageContext): string {
  const days = daysSince(ctx.card.lastContactedAt, ctx.now);
  const stable = {
    cardId: ctx.card.id,
    name: pickName(ctx.card),
    role: pickRole(ctx.card),
    company: pickCompany(ctx.card),
    why: ctx.card.whyRemember ?? "",
    eventTag: ctx.card.firstMetEventTag ?? "",
    bucket: bucketDays(days),
    eventNotes: ctx.recentEvents
      .map((e) => (e.note ?? "").slice(0, 80))
      .filter(Boolean)
      .sort()
      .join("|"),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
}

export function buildReengagePrompt(ctx: ReengageContext): string {
  const card = ctx.card;
  const days = daysSince(card.lastContactedAt, ctx.now);
  const lines: string[] = [];
  lines.push(`對方：${pickName(card)}`);
  if (pickRole(card)) lines.push(`職稱：${pickRole(card)}`);
  if (pickCompany(card)) lines.push(`公司：${pickCompany(card)}`);
  if (card.whyRemember) lines.push(`為什麼記得：${card.whyRemember}`);
  if (card.firstMetEventTag) lines.push(`首次見面場合：${card.firstMetEventTag}`);
  if (card.firstMetDate) lines.push(`首次見面日期：${card.firstMetDate}`);
  if (days !== null) {
    lines.push(`距上次互動：${days} 天`);
  } else {
    lines.push("距上次互動：尚未有任何互動紀錄");
  }
  if (ctx.recentEvents.length > 0) {
    lines.push("");
    lines.push("近期互動歷史（新→舊）：");
    for (const e of ctx.recentEvents.slice(0, 5)) {
      const note = e.note?.trim() || "（無備註）";
      lines.push(`- ${e.at.toISOString().slice(0, 10)}：${note.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "你是商務人脈訊息草稿助手，幫使用者重新聯絡許久未見的人。" +
  "根據對方的背景與互動歷史，產出 3 種風格的訊息草稿，讓使用者複製貼上即可發送。\n" +
  "回答必須是合法 JSON，符合 schema：\n" +
  '{"shortMessage": string, "email": {"subject": string, "body": string}, "casualPing": string}\n' +
  "規則：\n" +
  "- shortMessage：LINE / WhatsApp 風格，2-3 句，輕快，可帶 emoji。280 字內。直接稱呼名字開頭。\n" +
  "- email.subject：120 字內，要具體（避免「你好」這種空泛 subject）。\n" +
  "- email.body：4-6 句，正式但不冗長，1200 字內。包含 hook + 為什麼今天聯絡 + 開放性結尾。\n" +
  "- casualPing：「剛好想到你」自然偶遇 hook，2-3 句，280 字內。引用一個具體記憶 hook（whyRemember 或互動歷史）。\n" +
  "- 用繁體中文寫，但專有名詞保留原文。\n" +
  "- 不要捏造對方的近況或事件 — 只根據提供的資料推理。\n" +
  "- 不要任何 markdown 圍欄，只回傳 JSON。";

export function buildReengageMessages(
  ctx: ReengageContext,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildReengagePrompt(ctx) },
  ];
}

function sanitizeStr(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function parseReengageResponse(raw: string): ReengageDrafts | null {
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
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const shortMessage = sanitizeStr(obj.shortMessage, MAX_SHORT_LEN);
  const casualPing = sanitizeStr(obj.casualPing, MAX_CASUAL_LEN);
  const emailObj = obj.email;
  const subject =
    emailObj && typeof emailObj === "object"
      ? sanitizeStr((emailObj as { subject?: unknown }).subject, MAX_EMAIL_SUBJECT_LEN)
      : "";
  const body =
    emailObj && typeof emailObj === "object"
      ? sanitizeStr((emailObj as { body?: unknown }).body, MAX_EMAIL_BODY_LEN)
      : "";

  if (!shortMessage && !casualPing && !subject && !body) return null;

  return {
    shortMessage,
    email: { subject, body },
    casualPing,
  };
}

export function isEmptyReengage(d: ReengageDrafts | null): boolean {
  if (!d) return true;
  return !d.shortMessage && !d.casualPing && !d.email.subject && !d.email.body;
}
