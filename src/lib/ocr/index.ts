import "server-only";

import { createMinimaxProvider } from "./minimax";
import { createStubProvider } from "./stub";
import type { OcrProvider } from "./types";

/**
 * Resolve the active OCR provider. Order:
 *   1. OCR_PROVIDER env hard-override (useful for E2E with "stub")
 *   2. MiniMax if MINIMAX_API_KEY is present
 *   3. Stub (so dev never 500s when keys are missing)
 */
export function getOcrProvider(): OcrProvider {
  const forced = process.env.OCR_PROVIDER;
  if (forced === "stub") return createStubProvider();
  if (forced === "minimax") return createMinimaxProvider();
  if (process.env.MINIMAX_API_KEY) return createMinimaxProvider();
  return createStubProvider();
}

export type { OcrProvider, OcrOptions, OcrResult, OcrFields, OcrField, OcrError } from "./types";
export { LOW_CONFIDENCE_THRESHOLD, isLowConfidence, ocrFieldsSchema } from "./types";
