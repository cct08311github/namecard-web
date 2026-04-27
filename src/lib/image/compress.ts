/**
 * Client-side image compression using HTMLCanvasElement.
 *
 * Reduces iPhone photos (3–10 MB) before they hit the Server Action body
 * limit. No npm dependencies — browser Canvas API only.
 *
 * Key design decisions:
 * - Uses createImageBitmap() with { imageOrientation: "from-image" } so EXIF
 *   orientation is respected natively. Falls back to a plain <img> load for
 *   older Safari that doesn't support the imageOrientation option.
 * - Skips compression when the file is already small enough to avoid an
 *   unnecessary round-trip through canvas (which can slightly degrade quality).
 * - Enforces a longest-side cap so megapixel counts stay sane regardless of
 *   portrait vs. landscape orientation.
 */

export interface CompressOptions {
  /** Skip compression if the file is already below this size. Default: 2 MB. */
  skipIfBelowBytes?: number;
  /** Resize so that Math.max(width, height) ≤ this value. Default: 2048. */
  maxLongestSide?: number;
  /** JPEG quality 0..1 for canvas.toBlob. Default: 0.85. */
  quality?: number;
  /** Output MIME type. Default: "image/jpeg". */
  outputMime?: string;
}

const DEFAULTS = {
  skipIfBelowBytes: 2 * 1024 * 1024, // 2 MB
  maxLongestSide: 2048,
  quality: 0.85,
  outputMime: "image/jpeg",
} as const satisfies Required<CompressOptions>;

/**
 * Compress an image File/Blob to a smaller Blob.
 *
 * Returns the original Blob unchanged when:
 *   - the file is already below `skipIfBelowBytes`, or
 *   - the canvas/bitmap APIs are unavailable (e.g. Node test environment).
 *
 * @throws if the image cannot be decoded at all (corrupt file).
 */
export async function compressImage(file: File | Blob, opts?: CompressOptions): Promise<Blob> {
  const { skipIfBelowBytes, maxLongestSide, quality, outputMime }: Required<CompressOptions> = {
    ...DEFAULTS,
    ...opts,
  };

  // Skip compression for small files to preserve quality.
  if (file.size < skipIfBelowBytes) {
    return file;
  }

  // Guard: canvas is not available in non-browser environments (SSR, tests).
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  let imgWidth: number;
  let imgHeight: number;

  // Attempt createImageBitmap with EXIF orientation — supported in Chrome 65+,
  // Firefox 90+, Safari 17.4+. Fall back to <img> decode for older Safari.
  // We also re-check that createImageBitmap still exists at call time in case
  // the environment changed (e.g. test mocks).
  const supportsOrientation =
    typeof createImageBitmap !== "undefined" && (await canUseImageBitmapOrientation());

  if (supportsOrientation) {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    imgWidth = bitmap.width;
    imgHeight = bitmap.height;
  } else {
    // Fallback: draw via <img> element. EXIF rotation won't be applied by the
    // browser canvas so the result may be rotated, but it's still compressed.
    const dataUrl = await blobToDataUrl(file);
    const img = await loadImage(dataUrl);
    imgWidth = img.naturalWidth;
    imgHeight = img.naturalHeight;
    // We'll use the img element below instead of the bitmap.
    bitmap = null;
    const canvas = document.createElement("canvas");
    const { drawW, drawH } = scaleDimensions(imgWidth, imgHeight, maxLongestSide);
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, drawW, drawH);
    return canvasToBlob(canvas, outputMime, quality);
  }

  // Normal path: use ImageBitmap (with correct orientation).
  const { drawW, drawH } = scaleDimensions(imgWidth, imgHeight, maxLongestSide);
  const canvas = document.createElement("canvas");
  canvas.width = drawW;
  canvas.height = drawH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, drawW, drawH);
  bitmap.close();
  return canvasToBlob(canvas, outputMime, quality);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scale dimensions so the longest side is ≤ maxSide, preserving aspect. */
function scaleDimensions(w: number, h: number, maxSide: number): { drawW: number; drawH: number } {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { drawW: w, drawH: h };
  const ratio = maxSide / longest;
  return { drawW: Math.round(w * ratio), drawH: Math.round(h * ratio) };
}

/** Promisify canvas.toBlob. */
function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob produced null"));
      },
      mime,
      quality,
    );
  });
}

/** Read a Blob as a data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Load an <img> from a data URL and resolve when it's decoded. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load failed: ${String(e)}`));
    img.src = src;
  });
}

/**
 * Test whether createImageBitmap supports the { imageOrientation } option.
 * This option was added to Safari in 17.4; older Safari silently ignores it
 * or throws. We do a one-shot probe and cache the result.
 */
let _orientationSupported: boolean | null = null;
async function canUseImageBitmapOrientation(): Promise<boolean> {
  if (_orientationSupported !== null) return _orientationSupported;
  if (typeof createImageBitmap === "undefined") {
    _orientationSupported = false;
    return false;
  }
  try {
    // 1×1 transparent PNG
    const onePx =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const resp = await fetch(onePx);
    const blob = await resp.blob();
    const bm = await createImageBitmap(blob, { imageOrientation: "from-image" });
    bm.close();
    _orientationSupported = true;
  } catch {
    _orientationSupported = false;
  }
  return _orientationSupported;
}
