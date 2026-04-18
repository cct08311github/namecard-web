import { z } from "zod";

/**
 * OCR provider contract — shared by MiniMax (primary), GPT-4o (fallback),
 * and future local providers. Kept small so switching provider is just
 * swapping the implementation module.
 */

export type ProviderId = "minimax" | "openai" | "stub";

export interface OcrOptions {
  /** Image source — Buffer (server-side) or URL (if provider accepts remote). */
  source: { kind: "buffer"; data: Buffer; mimeType: string } | { kind: "url"; url: string };
  /** Language hint to bias multilingual models. Defaults to "mixed". */
  hintLanguage?: "zh-TW" | "zh-CN" | "en" | "ja" | "mixed";
  /** Request timeout in ms. */
  timeoutMs?: number;
}

export interface OcrProvider {
  readonly id: ProviderId;
  extract(options: OcrOptions): Promise<OcrResult>;
}

/** Result envelope — always structured so callers can pattern-match. */
export type OcrResult =
  | { ok: true; fields: OcrFields; meta: OcrMeta }
  | { ok: false; error: OcrError };

export interface OcrMeta {
  provider: ProviderId;
  model?: string;
  durationMs: number;
  rawResponse?: unknown;
}

export type OcrError =
  | { kind: "network"; message: string }
  | { kind: "rate-limit"; message: string; retryAfterMs?: number }
  | { kind: "invalid-response"; message: string; raw?: unknown }
  | { kind: "unsupported"; message: string }
  | { kind: "unknown"; message: string };

/**
 * Fields the OCR layer extracts from a card image. Shape mirrors the
 * user-facing CardCreateInput so pre-fill on the review form is a
 * near-direct map. Every field carries its own confidence so the UI can
 * highlight anything < 0.7 for manual review.
 *
 * `value` is the OCR-suggested string, `confidence` is 0..1 or null if
 * the provider doesn't quote one.
 */
export const ocrFieldSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type OcrField = z.infer<typeof ocrFieldSchema>;

export const ocrFieldsSchema = z.object({
  nameZh: ocrFieldSchema.optional(),
  nameEn: ocrFieldSchema.optional(),
  namePhonetic: ocrFieldSchema.optional(),
  jobTitleZh: ocrFieldSchema.optional(),
  jobTitleEn: ocrFieldSchema.optional(),
  department: ocrFieldSchema.optional(),
  companyZh: ocrFieldSchema.optional(),
  companyEn: ocrFieldSchema.optional(),
  companyWebsite: ocrFieldSchema.optional(),
  phones: z
    .array(
      z.object({
        label: z.enum(["mobile", "office", "home", "fax", "other"]).default("other"),
        value: z.string(),
        confidence: z.number().min(0).max(1).nullable().optional(),
      }),
    )
    .default([]),
  emails: z
    .array(
      z.object({
        label: z.enum(["work", "personal", "other"]).default("work"),
        value: z.string(),
        confidence: z.number().min(0).max(1).nullable().optional(),
      }),
    )
    .default([]),
  addresses: z
    .array(
      z.object({
        line1: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
      }),
    )
    .default([]),
  social: z
    .object({
      lineId: ocrFieldSchema.optional(),
      wechatId: ocrFieldSchema.optional(),
      linkedinUrl: ocrFieldSchema.optional(),
      twitterHandle: ocrFieldSchema.optional(),
      websiteUrl: ocrFieldSchema.optional(),
    })
    .default({}),
});
export type OcrFields = z.infer<typeof ocrFieldsSchema>;

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function isLowConfidence(f: OcrField | undefined): boolean {
  if (!f) return false;
  if (f.confidence === null || f.confidence === undefined) return false;
  return f.confidence < LOW_CONFIDENCE_THRESHOLD;
}
