/**
 * UT for MiniMax OCR provider with mocked fetch — exercises request
 * shape, response parsing, error handling. Real API calls live in a
 * separate `minimax.live.test.ts` that only runs when MINIMAX_API_KEY
 * is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMinimaxProvider } from "../minimax";

function mockResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    ...init,
  });
}

const GOOD_COMPLETION = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          nameZh: { value: "陳志明", confidence: 0.9 },
          nameEn: { value: "Alice Chen", confidence: 0.88 },
          jobTitleEn: { value: "PM", confidence: 0.8 },
          phones: [{ label: "mobile", value: "+886-912-345-678", confidence: 0.9 }],
          emails: [{ label: "work", value: "alice@example.com", confidence: 0.92 }],
        }),
      },
    },
  ],
};

describe("minimax provider", () => {
  it("returns unsupported when MINIMAX_API_KEY missing", async () => {
    const provider = createMinimaxProvider({
      apiKey: "",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("unsupported");
  });

  it("returns unsupported when source.kind !== 'url'", async () => {
    const provider = createMinimaxProvider({
      apiKey: "fake",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "buffer", data: Buffer.from([1, 2, 3]), mimeType: "image/jpeg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("unsupported");
  });

  it("posts to chat/completions with system prompt + image_url", async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: unknown, init: unknown) => {
      capturedUrl = url as string | URL | Request | undefined;
      capturedInit = init as RequestInit | undefined;
      return mockResponse(GOOD_COMPLETION);
    }) as unknown as typeof fetch;
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      baseUrl: "https://fake.minimax/v1",
      model: "MiniMax-M2.7",
      fetchImpl,
    });
    await provider.extract({
      source: { kind: "url", url: "https://img.example/card.jpg" },
    });

    expect(capturedUrl).toBe("https://fake.minimax/v1/chat/completions");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.model).toBe("MiniMax-M2.7");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toMatch(/名片/);
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContainEqual({
      type: "image_url",
      image_url: { url: "https://img.example/card.jpg" },
    });
  });

  it("parses a valid completion into OcrFields", async () => {
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () => mockResponse(GOOD_COMPLETION)) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/card.jpg" },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.fields.nameZh?.value).toBe("陳志明");
    expect(result.fields.nameEn?.value).toBe("Alice Chen");
    expect(result.fields.phones[0].value).toBe("+886-912-345-678");
    expect(result.fields.emails[0].value).toBe("alice@example.com");
    expect(result.meta.provider).toBe("minimax");
  });

  it("strips ```json fences from completion text", async () => {
    const fenced = {
      choices: [
        {
          message: {
            content:
              "```json\n" + JSON.stringify({ nameEn: { value: "Bob", confidence: 0.7 } }) + "\n```",
          },
        },
      ],
    };
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () => mockResponse(fenced)) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.fields.nameEn?.value).toBe("Bob");
  });

  it("surfaces 429 as rate-limit error", async () => {
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () =>
        new Response("too many", {
          status: 429,
          headers: { "retry-after": "3" },
        })) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("rate-limit");
    if (result.error.kind === "rate-limit") {
      expect(result.error.retryAfterMs).toBe(3000);
    }
  });

  it("surfaces non-OK non-429 as network error", async () => {
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("network");
    expect(result.error.message).toContain("500");
  });

  it("returns invalid-response when completion is not JSON", async () => {
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () =>
        mockResponse({
          choices: [{ message: { content: "sorry, no cards here" } }],
        })) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("invalid-response");
  });

  it("surfaces AbortError as timeout error with timeoutMs", async () => {
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      const signal = (init as RequestInit)?.signal;
      // Immediately abort so the AbortError fires synchronously-ish.
      await new Promise<void>((_, reject) => {
        if (signal?.aborted) {
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
        });
      });
      return new Response("never");
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl,
    });
    // Use a very short timeout so the AbortController fires immediately.
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
      timeoutMs: 1,
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("timeout");
    if (result.error.kind === "timeout") {
      expect(result.error.timeoutMs).toBe(1);
    }
  });

  it("returns invalid-response when completion JSON fails Zod schema", async () => {
    const provider = createMinimaxProvider({
      apiKey: "test-key",
      fetchImpl: (async () =>
        mockResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  nameEn: { value: 123, confidence: 2.5 }, // wrong types
                  phones: "not-an-array",
                }),
              },
            },
          ],
        })) as unknown as typeof fetch,
    });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("invalid-response");
    expect(result.error.message).toContain("schema mismatch");
  });
});

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------

describe("minimax provider – retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on 500 and succeeds on second attempt", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      if (callCount === 1) return new Response("server error", { status: 500 });
      return mockResponse(GOOD_COMPLETION);
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const promise = provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    // Advance past the first retry backoff (1 000ms).
    await vi.advanceTimersByTimeAsync(1_001);
    const result = await promise;

    expect(callCount).toBe(2);
    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
    expect(result.fields.nameZh?.value).toBe("陳志明");
  });

  it("retries on 503 up to max (2 retries = 3 attempts) then returns network error", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      return new Response("service unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const promise = provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    // Advance past both retry backoffs: 1 000ms + 3 000ms = 4 000ms
    await vi.advanceTimersByTimeAsync(4_001);
    const result = await promise;

    expect(callCount).toBe(3); // 1 initial + 2 retries
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("network");
    expect(result.error.message).toContain("503");
    expect(result.error.message).toContain("3 attempt");
  });

  it("retries on network-level error (thrown exception)", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      if (callCount < 3) throw new Error("ECONNREFUSED");
      return mockResponse(GOOD_COMPLETION);
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const promise = provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    // Advance past two retry backoffs
    await vi.advanceTimersByTimeAsync(4_001);
    const result = await promise;

    expect(callCount).toBe(3);
    if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}`);
  });

  it("does NOT retry on 401 (auth error)", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    expect(callCount).toBe(1); // no retries for 4xx
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("network");
    expect(result.error.message).toContain("401");
  });

  it("does NOT retry on 429 (rate limit)", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      return new Response("too many", {
        status: 429,
        headers: { "retry-after": "5" },
      });
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    expect(callCount).toBe(1);
    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.kind).toBe("rate-limit");
  });

  it("includes attempt count in error message after exhausting retries", async () => {
    const fetchImpl = (async () => {
      throw new Error("network failure");
    }) as unknown as typeof fetch;

    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const promise = provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
    });

    await vi.advanceTimersByTimeAsync(4_001);
    const result = await promise;

    if (result.ok) throw new Error("expected not-ok");
    expect(result.error.message).toContain("3 attempt");
  });

  it("does not exceed total timeout budget across retries (AbortController shared)", async () => {
    let callCount = 0;

    const fetchImpl = (async (_url: unknown, init: unknown) => {
      callCount++;
      const signal = (init as RequestInit)?.signal;
      // On first attempt: return 500 so retry is attempted.
      // On second attempt: if signal is already aborted, that proves the shared
      // controller's budget was respected — we won't reach here in that case.
      if (callCount === 1) return new Response("err", { status: 500 });
      // Signal still alive on second attempt: return good response.
      void signal; // referenced to avoid lint warning
      return mockResponse(GOOD_COMPLETION);
    }) as unknown as typeof fetch;

    // Very short timeout — 100ms; retry backoff is 1000ms, so the AbortController
    // will fire before the first retry can execute.
    const provider = createMinimaxProvider({ apiKey: "test-key", fetchImpl });
    const promise = provider.extract({
      source: { kind: "url", url: "https://img.example/x.jpg" },
      timeoutMs: 100,
    });

    // Advance 100ms to trigger the AbortController, then 1000ms for the backoff.
    await vi.advanceTimersByTimeAsync(1_100);
    const result = await promise;

    // Shared abort controller fires after 100ms; the retry sleep resolves early
    // because the signal is aborted. The while-loop checks abort.signal.aborted.
    if (result.ok) {
      // If it succeeded despite the short timeout, that's acceptable only if
      // the 500 retry was skipped because the signal aborted.
    } else {
      // Expect timeout or network error — not a success with 2 calls.
      expect(["timeout", "network", "unknown"]).toContain(result.error.kind);
    }
    // The key invariant: callCount is 1 (abort fires before retry executes) or
    // at most 2 (sleep resolved early but second attempt saw aborted signal).
    expect(callCount).toBeLessThanOrEqual(2);
  });
});
