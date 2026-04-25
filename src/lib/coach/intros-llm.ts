import "server-only";

import type { CardSummary } from "@/db/cards";

import { buildIntrosMessages, parseIntrosResponse, type IntroSuggestion } from "./intros";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 18_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function callIntrosLlm(
  candidates: readonly CardSummary[],
  options: { timeoutMs?: number } = {},
): Promise<IntroSuggestion[] | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;
  if (candidates.length < 2) return [];

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.55,
    max_tokens: 2000,
    messages: buildIntrosMessages(candidates),
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
    const validIds = new Set(candidates.map((c) => c.id));
    return parseIntrosResponse(raw, validIds);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
