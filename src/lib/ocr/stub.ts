import type { OcrProvider, OcrResult } from "./types";

/**
 * Stub provider used for E2E / local dev so the OCR flow can be exercised
 * without real API calls. Returns a fixed "Alice Chen" card after a short
 * simulated latency.
 */
export function createStubProvider(opts?: { delayMs?: number }): OcrProvider {
  const delayMs = opts?.delayMs ?? 50;
  return {
    id: "stub",
    async extract(): Promise<OcrResult> {
      await new Promise((r) => setTimeout(r, delayMs));
      return {
        ok: true,
        fields: {
          nameZh: { value: "王小明", confidence: 0.92 },
          nameEn: { value: "Alice Chen", confidence: 0.95 },
          jobTitleEn: { value: "Product Manager", confidence: 0.88 },
          companyEn: { value: "ACME Tech", confidence: 0.91 },
          phones: [{ label: "mobile", value: "+886-912-345-678", confidence: 0.9 }],
          emails: [{ label: "work", value: "alice@acme.example", confidence: 0.93 }],
          addresses: [],
          social: {},
        },
        meta: {
          provider: "stub",
          durationMs: delayMs,
        },
      };
    },
  };
}
