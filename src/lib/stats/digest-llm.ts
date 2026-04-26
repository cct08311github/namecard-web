import "server-only";

import type { AggregatedStats } from "./aggregate";
import { buildDigestMessages, parseDigest } from "./digest";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 12_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function callDigestLlm(
  stats: AggregatedStats,
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.4,
    max_tokens: 400,
    messages: buildDigestMessages(stats),
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
    return parseDigest(raw) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
