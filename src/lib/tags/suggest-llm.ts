import "server-only";

import type { CardCreateInput } from "@/db/schema";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_SUGGESTIONS = 5;

export interface SuggestLlmOptions {
  /** Existing workspace tag names — LLM should prefer re-using these. */
  existingTagNames: string[];
  /** Hard timeout in ms. Default 5000. */
  timeoutMs?: number;
}

interface MiniMaxChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function buildCardSummary(card: CardCreateInput): string {
  const parts: string[] = [];
  if (card.nameZh) parts.push(`姓名（中）：${card.nameZh}`);
  if (card.nameEn) parts.push(`姓名（英）：${card.nameEn}`);
  if (card.jobTitleZh) parts.push(`職稱（中）：${card.jobTitleZh}`);
  if (card.jobTitleEn) parts.push(`職稱（英）：${card.jobTitleEn}`);
  if (card.companyZh) parts.push(`公司（中）：${card.companyZh}`);
  if (card.companyEn) parts.push(`公司（英）：${card.companyEn}`);
  if (card.department) parts.push(`部門：${card.department}`);
  if (card.whyRemember) parts.push(`認識背景：${card.whyRemember}`);
  if (card.firstMetContext) parts.push(`第一次見面：${card.firstMetContext}`);
  if (card.firstMetEventTag) parts.push(`場合：${card.firstMetEventTag}`);
  const emailDomains = card.emails.map((e) => e.value.split("@")[1]).filter(Boolean);
  if (emailDomains.length) parts.push(`Email domain：${emailDomains.join(", ")}`);
  return parts.join("\n");
}

function extractJsonFromCompletion(raw: string): unknown {
  // Models sometimes wrap JSON in ```json ... ``` fences — strip them.
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1] : trimmed;
  return JSON.parse(inner!);
}

function validateSuggestions(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 40) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  return result;
}

/**
 * Ask MiniMax to suggest up to 5 tags (Chinese or English) for a card.
 *
 * Returns [] on any failure (network, timeout, parse error, rate limit).
 * Never throws — the panel should degrade silently when the LLM is down.
 */
export async function suggestTagsByLlm(
  card: CardCreateInput,
  options: SuggestLlmOptions,
): Promise<string[]> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return [];

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cardSummary = buildCardSummary(card);
  const existingList =
    options.existingTagNames.length > 0 ? options.existingTagNames.join("、") : "（無）";

  const body = {
    model,
    temperature: 0.3,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content:
          '你是名片標籤建議助手。根據下面的名片內容，建議最多 5 個標籤。優先重用這份 workspace 已有的標籤清單。只回傳 JSON array，例如 ["tech", "半導體"]，不要其他文字。',
      },
      {
        role: "user",
        content: `名片內容：\n${cardSummary}\n\n已有標籤：${existingList}`,
      },
    ],
  };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });

    if (!res.ok) return [];

    const json = (await res.json()) as MiniMaxChatResponse;
    const rawText = json.choices?.[0]?.message?.content;
    if (!rawText) return [];

    let parsed: unknown;
    try {
      parsed = extractJsonFromCompletion(rawText);
    } catch {
      return [];
    }

    return validateSuggestions(parsed);
  } catch {
    // Network error, timeout (AbortError), JSON parse failure — degrade silently.
    return [];
  } finally {
    clearTimeout(timer);
  }
}
