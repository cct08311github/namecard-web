import { createHash } from "node:crypto";

import type { CardSummary } from "@/db/cards";

export interface IntroSuggestion {
  cardAId: string;
  cardBId: string;
  /** 1-2 sentence rationale for why these two should know each other. */
  reason: string;
  /** Pre-written intro email body (no Subject — UI adds one). */
  draftEmail: string;
}

const MAX_PICKS = 5;
const MAX_REASON_LEN = 220;
const MAX_EMAIL_LEN = 1200;
const MAX_CANDIDATES = 30;

function pickName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function pickRole(card: CardSummary): string {
  return card.jobTitleZh || card.jobTitleEn || "";
}

function pickCompany(card: CardSummary): string {
  return card.companyZh || card.companyEn || "";
}

/**
 * Pick up to N candidates the LLM should consider. Prefer pinned cards
 * (user's signal of importance), then recently-contacted, then a
 * diversity sample across distinct companies. The LLM is bad at scaling
 * to 200 cards, so we narrow first.
 */
export function selectIntroCandidates(
  cards: readonly CardSummary[],
  max: number = MAX_CANDIDATES,
): CardSummary[] {
  const live = cards.filter(
    (c) => !c.deletedAt && (c.nameZh || c.nameEn) && (c.companyZh || c.companyEn),
  );
  if (live.length === 0) return [];

  const picked: CardSummary[] = [];
  const pickedIds = new Set<string>();
  const pinned = live.filter((c) => c.isPinned);
  for (const c of pinned) {
    if (picked.length >= max) break;
    if (!pickedIds.has(c.id)) {
      picked.push(c);
      pickedIds.add(c.id);
    }
  }

  const recent = [...live]
    .filter((c) => !pickedIds.has(c.id))
    .sort((a, b) => {
      const ta = a.lastContactedAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
      const tb = b.lastContactedAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });
  for (const c of recent) {
    if (picked.length >= max) break;
    picked.push(c);
    pickedIds.add(c.id);
  }
  return picked;
}

/**
 * Stable cache key — picks shouldn't change minute-to-minute. Bucket
 * by week (so refreshes feel "weekly digest" cadence) + sorted
 * candidate ids (fresh card additions invalidate the cache, otherwise
 * same set → same suggestions).
 */
export function introsCacheKey(now: Date, candidateIds: readonly string[]): string {
  // week bucket: floor(epochDays / 7)
  const weekBucket = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
  const sortedIds = [...candidateIds].sort().join(",");
  const hash = createHash("sha256").update(sortedIds).digest("hex").slice(0, 16);
  return `w${weekBucket}::${hash}`;
}

const SYSTEM_PROMPT =
  "你是 super-connector AI — 幫使用者從他名片冊中找出「應該介紹給彼此」的 pair。" +
  "目標：提升使用者的網絡價值，把他變成 ecosystem 的 connector，不只是 contact owner。\n" +
  "回答必須是合法 JSON，符合 schema：\n" +
  '{"intros": [{"cardAId": string, "cardBId": string, "reason": string, "draftEmail": string}]}\n' +
  "規則：\n" +
  "- 找 3-5 對。少於 3 個明顯 fit 就回少一點，不要硬湊。\n" +
  "- cardAId / cardBId 必須是候選人的卡片 ID。不准捏造。cardA !== cardB。\n" +
  "- reason 220 字內：解釋為什麼這兩位應該認識（互補需求 / 同產業互補角色 / 互相需要對方資源）。要具體，引用兩位的職位、公司、為什麼記得。\n" +
  "- draftEmail 1200 字內：使用者寄給他們的 intro email body（不含 subject）。包含三段：\n" +
  "    1. Hi A 跟 B，介紹一下…\n" +
  "    2. A 是 X 公司 Y 職位，目前在做 Z (來自 whyRemember)\n" +
  "    3. B 是 …\n" +
  "    結尾：「我覺得你們應該聊一下因為…，你們自己接手吧 :)」\n" +
  "- 用繁體中文，但專有名詞英文保留。\n" +
  "- 不要捏造對方的具體事；只根據提供的資料推理。\n" +
  "- 同公司的兩人不要互介（已經知道彼此）。\n" +
  "- 不要有任何說明文字、不要 markdown 圍欄。";

export function buildIntrosPrompt(candidates: readonly CardSummary[]): string {
  const lines: string[] = [];
  lines.push(`從以下 ${candidates.length} 位候選人中找 3-5 對應該介紹的 pair。`);
  lines.push("");
  lines.push("=== 候選人 ===");
  for (const c of candidates) {
    lines.push("");
    const role = pickRole(c);
    const company = pickCompany(c);
    lines.push(`# ${pickName(c)}`);
    lines.push(`卡片 ID: ${c.id}`);
    if (role) lines.push(`職稱: ${role}`);
    if (company) lines.push(`公司: ${company}`);
    if (c.department) lines.push(`部門: ${c.department}`);
    if (c.firstMetEventTag) lines.push(`認識場合: ${c.firstMetEventTag}`);
    if (c.whyRemember) lines.push(`為什麼記得: ${c.whyRemember}`);
  }
  return lines.join("\n");
}

export function buildIntrosMessages(
  candidates: readonly CardSummary[],
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildIntrosPrompt(candidates) },
  ];
}

function sanitizeStr(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Parse + harden the LLM response. Drops:
 *   - non-object items
 *   - cardId not in the candidate set (anti-hallucination)
 *   - cardA === cardB (anti-self-pair)
 *   - duplicate (A,B) pairs (regardless of order)
 *   - missing reason or draftEmail
 */
export function parseIntrosResponse(
  raw: string,
  validCardIds: ReadonlySet<string>,
): IntroSuggestion[] {
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
  const intros = (parsed as { intros?: unknown }).intros;
  if (!Array.isArray(intros)) return [];

  const seenPairs = new Set<string>();
  const out: IntroSuggestion[] = [];
  for (const item of intros) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const cardAId = sanitizeStr(obj.cardAId, 200);
    const cardBId = sanitizeStr(obj.cardBId, 200);
    if (!cardAId || !cardBId) continue;
    if (cardAId === cardBId) continue;
    if (!validCardIds.has(cardAId) || !validCardIds.has(cardBId)) continue;
    const pairKey = [cardAId, cardBId].sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    const reason = sanitizeStr(obj.reason, MAX_REASON_LEN);
    const draftEmail = sanitizeStr(obj.draftEmail, MAX_EMAIL_LEN);
    if (!reason || !draftEmail) continue;
    seenPairs.add(pairKey);
    out.push({ cardAId, cardBId, reason, draftEmail });
    if (out.length >= MAX_PICKS) break;
  }
  return out;
}
