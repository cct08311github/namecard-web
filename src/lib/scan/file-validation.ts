/**
 * Magic-byte image validation.
 *
 * Client-supplied MIME types are untrustworthy — an attacker can label
 * an SVG (which can carry <script> tags) as "image/jpeg". We inspect the
 * first 12 bytes of the raw buffer to confirm the actual file format,
 * and reject SVG entirely because it is not detectable by magic bytes
 * alone and can execute script when rendered by a browser.
 *
 * Supported kinds: jpeg, png, webp, heic, heif.
 * Anything else (including SVG) is rejected.
 *
 * No npm dependencies — pure Node.js Buffer comparisons.
 */

export type DetectedImageKind = "jpeg" | "png" | "webp" | "heic" | "heif";

export interface ImageValidationResult {
  valid: boolean;
  detectedKind?: DetectedImageKind;
  /** Human-readable rejection reason, set when valid === false. */
  reason?: string;
}

/**
 * Inspects the first bytes of `buffer` and returns whether it is a
 * recognised safe image format (JPEG / PNG / WebP / HEIC / HEIF).
 *
 * @param buffer - Raw file bytes (only the first 12 are examined).
 */
export function validateImageMagicBytes(buffer: Buffer): ImageValidationResult {
  if (buffer.byteLength < 4) {
    return { valid: false, reason: "file too small to determine type" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedKind: "jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer.byteLength >= 8 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedKind: "png" };
  }

  // WebP: RIFF????WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    buffer.byteLength >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { valid: true, detectedKind: "webp" };
  }

  // HEIC / HEIF: ftyp box at offset 4 with compatible brand
  // Layout: [size:4][ftyp:4][brand:4][...] — we look at bytes 4-11.
  if (buffer.byteLength >= 12) {
    const ftyp = buffer.toString("ascii", 4, 8);
    if (ftyp === "ftyp") {
      const brand = buffer.toString("ascii", 8, 12);
      // heic, heix, hevc, mif1, msf1
      const heicBrands = ["heic", "heix", "hevc", "mif1", "msf1"];
      if (heicBrands.includes(brand)) {
        const kind: DetectedImageKind = brand === "msf1" ? "heif" : "heic";
        return { valid: true, detectedKind: kind };
      }
    }
  }

  return {
    valid: false,
    reason:
      "unsupported or unsafe file type — only JPEG, PNG, WebP, HEIC, and HEIF are allowed; SVG is rejected",
  };
}
