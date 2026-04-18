"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
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
