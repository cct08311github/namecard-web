import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardCreateInput } from "@/db/schema";

import { suggestTagsByLlm } from "../suggest-llm";

/** Minimal valid CardCreateInput for testing. */
function makeCard(overrides: Partial<CardCreateInput> = {}): CardCreateInput {
  return {
    phones: [],
    emails: [],
    addresses: [],
    social: {},
    tagIds: [],
    tagNames: [],
    whyRemember: "met at conference",
    nameEn: "Alice Chen",
    companyEn: "ACME Corp",
    isPinned: false,
    ...overrides,
  };
}

const baseOpts = { existingTagNames: [] };

function makeFetchOk(content: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  }) as unknown as typeof fetch;
}

describe("suggestTagsByLlm", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal("fetch", undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns [] immediately when MINIMAX_API_KEY is not set", async () => {
    delete process.env.MINIMAX_API_KEY;
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("happy path: parses JSON array from response", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk('["tech", "半導體"]'));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual(["tech", "半導體"]);
  });

  it("handles ```json code fence variants", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk('```json\n["tech","finance"]\n```'));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual(["tech", "finance"]);
  });

  it("handles plain ``` code fence (no language tag)", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk('```\n["ai"]\n```'));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual(["ai"]);
  });

  it("returns [] on non-JSON response", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk("Sorry, I cannot suggest tags."));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual([]);
  });

  it("returns [] on empty array response", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk("[]"));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual([]);
  });

  it("filters out empty strings and trims whitespace", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk('[" tech ", "", "  ", "半導體"]'));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual(["tech", "半導體"]);
  });

  it("caps at 5 even if LLM returns 10 items", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    const bigArray = JSON.stringify(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    vi.stubGlobal("fetch", makeFetchOk(bigArray));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result.length).toBe(5);
  });

  it("deduplicates suggestions from LLM response", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", makeFetchOk('["tech", "Tech", "TECH"]'));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual(["tech"]);
  });

  it("returns [] when fetch returns non-ok status", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      }),
    );

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual([]);
  });

  it("returns [] when fetch throws (network error)", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await suggestTagsByLlm(makeCard(), baseOpts);
    expect(result).toEqual([]);
  });

  it("returns [] on timeout via AbortController", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    // Simulate a fetch that never resolves then times out
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const result = await suggestTagsByLlm(makeCard(), { ...baseOpts, timeoutMs: 1 });
    expect(result).toEqual([]);
  });
});
