import "server-only";

import { buildBriefingMessages, parseBriefingResponse, type BriefingPick } from "./briefing";
import type { PriorityCandidate } from "./priority";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 12_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Call MiniMax to narrow N pre-scored candidates to the top 3 with
 * human-voice reasons. Returns null on any failure (matches the rest
 * of the coach module's degrade-silently pattern).
 */
export async function callBriefingLlm(
  candidates: readonly PriorityCandidate[],
  today: Date,
  options: { timeoutMs?: number; recentNotes?: ReadonlyMap<string, string> } = {},
): Promise<BriefingPick[] | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;
  if (candidates.length === 0) return [];

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.4,
    max_tokens: 800,
    messages: buildBriefingMessages(candidates, today, options.recentNotes),
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
    if (!res.ok) return null;
    const json = (await res.json()) as MiniMaxChatResponse;
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    const validIds = new Set(candidates.map((c) => c.card.id));
    return parseBriefingResponse(raw, validIds);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
