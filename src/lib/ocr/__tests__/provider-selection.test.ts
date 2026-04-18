import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getOcrProvider } from "../index";

/**
 * Provider selection is env-driven so prod swaps between MiniMax / stub /
 * forced override without code changes. Covers the four decision paths in
 * src/lib/ocr/index.ts so a regression (e.g. forgetting to consult
 * OCR_PROVIDER) is caught immediately.
 */
describe("getOcrProvider — env-driven resolution", () => {
  const originalProvider = process.env.OCR_PROVIDER;
  const originalKey = process.env.MINIMAX_API_KEY;

  beforeEach(() => {
    delete process.env.OCR_PROVIDER;
    delete process.env.MINIMAX_API_KEY;
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = originalProvider;
    if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = originalKey;
  });

  it("returns stub when no env is set", () => {
    const provider = getOcrProvider();
    expect(provider.id).toBe("stub");
  });

  it("forces stub when OCR_PROVIDER=stub, even with MiniMax key present", () => {
    process.env.OCR_PROVIDER = "stub";
    process.env.MINIMAX_API_KEY = "sk-fake";
    const provider = getOcrProvider();
    expect(provider.id).toBe("stub");
  });

  it("forces minimax when OCR_PROVIDER=minimax", () => {
    process.env.OCR_PROVIDER = "minimax";
    process.env.MINIMAX_API_KEY = "sk-fake";
    const provider = getOcrProvider();
    expect(provider.id).toBe("minimax");
  });

  it("auto-selects minimax when MINIMAX_API_KEY is set and no override", () => {
    process.env.MINIMAX_API_KEY = "sk-fake";
    const provider = getOcrProvider();
    expect(provider.id).toBe("minimax");
  });

  it("falls back to stub when MINIMAX_API_KEY is empty string", () => {
    process.env.MINIMAX_API_KEY = "";
    const provider = getOcrProvider();
    expect(provider.id).toBe("stub");
  });
});
