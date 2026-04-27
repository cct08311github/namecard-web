/**
 * Magic-byte (file signature) validation for uploaded images.
 *
 * Rejects files whose actual bytes don't match a known image format,
 * which prevents SVG-XSS and other MIME-type spoofing attacks (P1, #248).
 */

export type ImageKind = "jpeg" | "png" | "webp" | "heic" | "heif";

/**
 * Inspects the first 12 bytes of a Buffer and returns the image format
 * if recognized, or null if the bytes don't match any known signature.
 */
export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: RIFF????WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  // HEIC/HEIF: bytes 4-7 = "ftyp", bytes 8-11 = brand
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString("ascii");
    if (["heic", "heix", "hevc"].includes(brand)) return "heic";
    if (["mif1", "msf1"].includes(brand)) return "heif";
  }

  return null; // unknown — REJECT
}

/**
 * Returns `{ valid: true, kind }` when the buffer matches a known safe
 * image format, or `{ valid: false }` when it should be rejected.
 */
export function validateImageMagicBytes(buffer: Buffer): { valid: boolean; kind?: ImageKind } {
  const kind = detectImageKind(buffer);
  return { valid: kind !== null, kind: kind ?? undefined };
}
