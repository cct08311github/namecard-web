import "server-only";

import { postProcess } from "./post-process";
import { SYSTEM_PROMPT_ZH_EN_MIXED, USER_PROMPT_EXTRACT } from "./prompts";
import { ocrFieldsSchema, type OcrOptions, type OcrProvider, type OcrResult } from "./types";

/**
 * MiniMax vision-chat OCR provider.
 *
 * MiniMax's chat-completion endpoint accepts multimodal content (text +
 * image_url) and returns a completion. We ask for a strict JSON object
 * and parse with Zod — anything that doesn't validate becomes an
 * `invalid-response` error, not a silent bad-shape pass.
 *
 * Model name is configurable via MINIMAX_MODEL so the user can swap
 * between MiniMax-M2.7 (if exists), abab6.5s-chat, MiniMax-VL-01 etc.
 * without code change.
 */

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 30_000;

interface MiniMaxChatResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface BuildRequestArgs {
  imageUrl: string;
  model: string;
}

function buildChatRequestBody({ imageUrl, model }: BuildRequestArgs): Record<string, unknown> {
  return {
    model,
    temperature: 0.1,
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT_ZH_EN_MIXED,
      },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT_EXTRACT },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  };
}

function extractJsonFromCompletion(raw: string): unknown {
  // Models sometimes wrap the JSON in ```json ... ``` fences — strip them.
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1] : trimmed;
  return JSON.parse(inner);
}

export function createMinimaxProvider(overrides?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): OcrProvider {
  const apiKey = overrides?.apiKey ?? process.env.MINIMAX_API_KEY ?? "";
  const baseUrl = overrides?.baseUrl ?? process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const model = overrides?.model ?? process.env.MINIMAX_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = overrides?.fetchImpl ?? fetch;

  return {
    id: "minimax",
    async extract(options: OcrOptions): Promise<OcrResult> {
      if (!apiKey) {
        return {
          ok: false,
          error: { kind: "unsupported", message: "MINIMAX_API_KEY not set" },
        };
      }
      if (options.source.kind !== "url") {
        return {
          ok: false,
          error: {
            kind: "unsupported",
            message:
              "MiniMax provider requires a signed image URL, not raw buffer. Upload to Storage first.",
          },
        };
      }

      const startedAt = Date.now();
      const body = buildChatRequestBody({
        imageUrl: options.source.url,
        model,
      });
      const abort = new AbortController();
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") ?? 0) * 1000 || undefined;
          return {
            ok: false,
            error: {
              kind: "rate-limit",
              message: `MiniMax 429; retry after ${retryAfter ?? "?"}ms`,
              retryAfterMs: retryAfter,
            },
          };
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            ok: false,
            error: {
              kind: "network",
              message: `MiniMax ${res.status}: ${text.slice(0, 200)}`,
            },
          };
        }
        const json = (await res.json()) as MiniMaxChatResponse;
        const rawText = json.choices?.[0]?.message?.content;
        if (!rawText) {
          return {
            ok: false,
            error: {
              kind: "invalid-response",
              message: "empty completion body",
              raw: json,
            },
          };
        }
        let parsed: unknown;
        try {
          parsed = extractJsonFromCompletion(rawText);
        } catch (err) {
          return {
            ok: false,
            error: {
              kind: "invalid-response",
              message: `completion was not JSON: ${(err as Error).message}`,
              raw: rawText,
            },
          };
        }
        const zodResult = ocrFieldsSchema.safeParse(parsed);
        if (!zodResult.success) {
          return {
            ok: false,
            error: {
              kind: "invalid-response",
              message: `schema mismatch: ${zodResult.error.issues
                .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
                .join("; ")}`,
              raw: parsed,
            },
          };
        }
        const fields = postProcess(zodResult.data);
        return {
          ok: true,
          fields,
          meta: {
            provider: "minimax",
            model,
            durationMs: Date.now() - startedAt,
            rawResponse: rawText,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: {
            kind: msg.includes("abort") ? "network" : "unknown",
            message: msg,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
