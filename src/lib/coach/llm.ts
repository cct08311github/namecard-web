import "server-only";

import {
  buildLlmMessages,
  parseCoachResponse,
  type CoachContext,
  type CoachInsight,
} from "./insights";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 12_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface CoachLlmOptions {
  /** Hard timeout in ms. Default 12000 (LLM is doing real reasoning). */
  timeoutMs?: number;
}

/**
 * Call MiniMax with a coach prompt. Returns null when:
 *  - no API key configured (graceful no-op)
 *  - network / HTTP error / timeout
 *  - response cannot be parsed into a CoachInsight
 *
 * Caller is responsible for caching — this fn is the raw LLM hop.
 */
export async function callCoachLlm(
  ctx: CoachContext,
  options: CoachLlmOptions = {},
): Promise<CoachInsight | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.5,
    max_tokens: 1200,
    messages: buildLlmMessages(ctx),
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
    return parseCoachResponse(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap probe so the UI can hide the section entirely when LLM unavailable. */
export function isCoachConfigured(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY);
}
