/**
 * UT for MiniMax OCR provider with mocked fetch — exercises request
 * shape, response parsing, error handling. Real API calls live in a
 * separate `minimax.live.test.ts` that only runs when MINIMAX_API_KEY
 * is set.
 */
import { describe, expect, it, vi } from "vitest";

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
