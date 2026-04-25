import "server-only";

import sharp from "sharp";

import { getAdminStorage } from "@/lib/firebase/server";

/**
 * Card-image storage pipeline — accepts a raw uploaded image buffer,
 * compresses to WebP (quality 82, max 2000px long edge), uploads to
 * users/{uid}/card-images/{uuid}.webp, and returns the path plus a
 * short-lived signed URL the OCR provider can fetch.
 *
 * Filename contract (UUID v4 + .webp) matches the Storage Rules regex
 * so unauthorized paths are rejected server-side.
 */

export interface UploadOptions {
  uid: string;
  fileBuffer: Buffer;
  originalName?: string;
  mimeType: string;
}

export interface UploadResult {
  path: string; // storage path, e.g. users/{uid}/card-images/{uuid}.webp
  bucket: string;
  signedUrl: string; // ~15 min expiry
  width: number;
  height: number;
  bytes: number;
}

const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_DIMENSION = 2000;
const WEBP_QUALITY = 82;

export async function uploadCardImage(opts: UploadOptions): Promise<UploadResult> {
  if (!opts.mimeType.startsWith("image/")) {
    throw new Error(`Unsupported content type: ${opts.mimeType}`);
  }

  // Resize + encode to WebP.
  const pipeline = sharp(opts.fileBuffer, { failOn: "error" })
    .rotate() // EXIF-aware orientation
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY });
  const { data: webp, info } = await pipeline.toBuffer({ resolveWithObject: true });

  const uuid = crypto.randomUUID();
  const path = `users/${opts.uid}/card-images/${uuid}.webp`;
  const bucket = getAdminStorage().bucket();
  const file = bucket.file(path);
  await file.save(webp, {
    contentType: "image/webp",
    metadata: {
      cacheControl: "private, max-age=3600",
      metadata: {
        uploadedBy: opts.uid,
        originalName: opts.originalName ?? "",
      },
    },
    resumable: false,
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: "v4",
  });

  return {
    path,
    bucket: bucket.name,
    signedUrl,
    width: info.width,
    height: info.height,
    bytes: webp.byteLength,
  };
}

/** Mint a fresh signed URL for a previously uploaded image. */
export async function signedUrlFor(path: string): Promise<string> {
  const bucket = getAdminStorage().bucket();
  const [url] = await bucket.file(path).getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: "v4",
  });
  return url;
}

/**
 * Batch-mint signed URLs in parallel. Returns a path → url map; failed
 * lookups are silently omitted so a stale or missing storage object
 * doesn't bring down the whole list view.
 *
 * Used by /cards page to render thumbnails — all storage round-trips
 * happen concurrently while the page already awaits its other data.
 */
export async function signedUrlsForBatch(
  paths: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const settled = await Promise.allSettled(unique.map((p) => signedUrlFor(p)));
  const out: Record<string, string> = {};
  settled.forEach((res, i) => {
    if (res.status === "fulfilled") out[unique[i]!] = res.value;
  });
  return out;
}

/** Delete an uploaded image. Safe to call for missing paths. */
export async function deleteCardImage(path: string): Promise<void> {
  const bucket = getAdminStorage().bucket();
  await bucket
    .file(path)
    .delete({ ignoreNotFound: true })
    .catch(() => {});
}
