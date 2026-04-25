import "server-only";

import {
  buildExtractMessages,
  parseExtractedCard,
  parseMultipleExtractedCards,
  type ExtractedCard,
} from "./extract";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 10_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function callExtractLlm(
  text: string,
  options: { timeoutMs?: number } = {},
): Promise<ExtractedCard | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 800,
    messages: buildExtractMessages(trimmed),
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
    return parseExtractedCard(raw, trimmed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multi-card variant: returns all cards the LLM extracted (length 0..N).
 * Same MiniMax round-trip; only the parser differs (`parseMultipleExtractedCards`).
 * Empty array on failure.
 */
export async function callExtractLlmMulti(
  text: string,
  options: { timeoutMs?: number } = {},
): Promise<ExtractedCard[]> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Bigger token budget than single — 5 cards × ~100 tokens each + headroom.
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 1800,
    messages: buildExtractMessages(trimmed),
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
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return [];
    return parseMultipleExtractedCards(raw, trimmed);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
