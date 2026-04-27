"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { getOcrProvider } from "@/lib/ocr";
import { validateImageMagicBytes } from "@/lib/scan/file-validation";
import { uploadCardImage } from "@/lib/storage/card-images";
import { incrementAndCheckScanLimit } from "@/db/scanLimits";

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

    // P1: Verify file magic bytes — reject SVG and any non-image type
    // regardless of the client-supplied MIME header.
    const magic = validateImageMagicBytes(buffer);
    if (!magic.valid) {
      return {
        ok: false as const,
        imagePath: null,
        error: {
          kind: "invalid-file-type",
          message: magic.reason ?? "unsupported file type",
        },
      };
    }

    // P1: Enforce per-user daily OCR quota.
    const dailyLimit = Number(process.env.OCR_DAILY_LIMIT_PER_USER ?? 50);
    const quota = await incrementAndCheckScanLimit(ctx.user.uid, dailyLimit);
    if (!quota.allowed) {
      return {
        ok: false as const,
        imagePath: null,
        error: {
          kind: "rate-limit-exceeded",
          message: `今日掃描次數已達上限（${dailyLimit} 次）。明天再試，或手動輸入名片資料。`,
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
