import "server-only";

import type { RecapItem } from "@/lib/recap/group";

import { buildActionItemsMessages, parseActionItems, type ActionItem } from "./action-items";

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 12_000;

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function callActionItemsLlm(
  items: readonly RecapItem[],
  options: { timeoutMs?: number } = {},
): Promise<ActionItem[] | null> {
  const apiKey = process.env.MINIMAX_API_KEY ?? "";
  if (!apiKey) return null;
  if (items.length === 0) return [];

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    temperature: 0.3,
    max_tokens: 800,
    messages: buildActionItemsMessages(items),
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
    const validIds = new Set(items.map((it) => it.card.id));
    return parseActionItems(raw, validIds);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
