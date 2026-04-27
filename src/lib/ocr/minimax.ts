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
 *
 * Retry policy:
 * - Max 2 retries (3 total attempts) with backoffs [1000ms, 3000ms].
 * - Only retries on TRANSIENT errors: network failures, 5xx, and timeouts.
 * - Does NOT retry on 4xx (including 401 auth errors) or rate-limit (429).
 * - All retries share a single AbortController so the 30s total budget is
 *   preserved; individual retries don't extend the overall deadline.
 */

const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_MODEL = "MiniMax-M2.7";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Backoff delays (ms) per retry attempt index. */
const RETRY_BACKOFFS_MS = [1_000, 3_000] as const;

/** Whether an HTTP status should trigger a retry. */
function isTransientStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

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

      // Single AbortController shared across all attempts so the total budget
      // (default 30s) is never extended by retries.
      const abort = new AbortController();
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => abort.abort(), timeoutMs);

      // attemptCount is surfaced in error messages for diagnostics.
      let attemptCount = 0;
      const maxRetries = RETRY_BACKOFFS_MS.length;

      try {
        while (true) {
          attemptCount++;

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

            // 429 — rate limit: do NOT retry (respects server back-pressure).
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

            // 4xx (non-429) — client errors such as auth failure: do NOT retry.
            if (res.status >= 400 && res.status < 500) {
              const text = await res.text().catch(() => "");
              return {
                ok: false,
                error: {
                  kind: "network",
                  message: `MiniMax ${res.status} (attempt ${attemptCount}): ${text.slice(0, 200)}`,
                },
              };
            }

            // 5xx — transient server error: retry if budget remains.
            if (isTransientStatus(res.status)) {
              const text = await res.text().catch(() => "");
              if (attemptCount <= maxRetries && !abort.signal.aborted) {
                const backoff = RETRY_BACKOFFS_MS[attemptCount - 1];
                await sleep(backoff, abort.signal);
                continue;
              }
              return {
                ok: false,
                error: {
                  kind: "network",
                  message: `MiniMax ${res.status} after ${attemptCount} attempt(s): ${text.slice(0, 200)}`,
                },
              };
            }

            // 2xx — parse the completion.
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
            // AbortError = timeout or signal triggered.
            if (err instanceof Error && err.name === "AbortError") {
              return {
                ok: false,
                error: {
                  kind: "timeout",
                  message: `MiniMax did not respond within ${timeoutMs}ms (attempt ${attemptCount})`,
                  timeoutMs,
                },
              };
            }

            // Network-level error (ECONNREFUSED, ENOTFOUND, etc.): retry.
            if (attemptCount <= maxRetries && !abort.signal.aborted) {
              const backoff = RETRY_BACKOFFS_MS[attemptCount - 1];
              await sleep(backoff, abort.signal);
              continue;
            }

            const msg = err instanceof Error ? err.message : String(err);
            return {
              ok: false,
              error: {
                kind: "unknown",
                message: `MiniMax failed after ${attemptCount} attempt(s): ${msg}`,
              },
            };
          }
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Sleep for `ms` milliseconds, resolving early if the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}
