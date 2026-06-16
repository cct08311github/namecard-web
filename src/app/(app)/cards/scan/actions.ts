"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { incrementAndCheckScanLimit } from "@/db/scanLimits";
import { validateImageMagicBytes } from "@/lib/scan/file-validation";
import { getOcrProvider } from "@/lib/ocr";
import { uploadCardImage } from "@/lib/storage/card-images";

/**
 * Server actions behind the Scan-a-card flow.
 *
 * `scanCardAction` accepts the raw image (via FormData → Buffer),
 * uploads it to Storage, fires the OCR provider against the signed URL,
 * and returns the extracted fields + imagePath. The client then hands
 * that payload to CardForm (pre-filled) + the user reviews + saves.
 */

const imageBase64Schema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.string().refine((v) => v.startsWith("image/"), "must be image/*"),
  originalName: z.string().max(200).optional(),
});

export const scanCardAction = authedAction
  .inputSchema(imageBase64Schema)
  .action(async ({ parsedInput, ctx }) => {
    const buffer = Buffer.from(parsedInput.fileBase64, "base64");
    if (buffer.byteLength === 0) {
      throw new Error("empty image payload");
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error("image exceeds 10MB limit");
    }

    // P1: magic-byte validation — reject SVG / non-image payloads before
    // they touch OCR or Storage (prevents SVG-XSS via uploaded "images").
    const magicCheck = validateImageMagicBytes(buffer);
    if (!magicCheck.valid) {
      return {
        ok: false as const,
        error: {
          kind: "invalid-image" as const,
          message: "檔案格式不符，僅接受 JPEG/PNG/WebP/HEIC",
        },
      };
    }

    // P1: per-user daily OCR rate limit (default 50/day, override via env).
    const limit = Number(process.env.OCR_DAILY_LIMIT_PER_USER ?? "50");
    const limitCheck = await incrementAndCheckScanLimit(ctx.user.uid, limit);
    if (!limitCheck.allowed) {
      return {
        ok: false as const,
        error: {
          kind: "rate-limit-exceeded" as const,
          message: `今日掃描次數已達上限（${limit} 張/天），請明日再試。`,
          usedToday: limitCheck.usedToday,
          limit,
        },
      };
    }

    const upload = await uploadCardImage({
      uid: ctx.user.uid,
      fileBuffer: buffer,
      originalName: parsedInput.originalName,
      mimeType: parsedInput.mimeType,
    });

    const provider = getOcrProvider();
    const ocrResult = await provider.extract({
      source: { kind: "url", url: upload.signedUrl },
      hintLanguage: "mixed",
    });

    if (!ocrResult.ok) {
      return {
        ok: false as const,
        imagePath: upload.path,
        error: ocrResult.error,
      };
    }

    return {
      ok: true as const,
      imagePath: upload.path,
      bucket: upload.bucket,
      fields: ocrResult.fields,
      meta: {
        provider: ocrResult.meta.provider,
        durationMs: ocrResult.meta.durationMs,
      },
    };
  });
