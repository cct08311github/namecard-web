import { describe, expect, it } from "vitest";

import { detectImageKind, validateImageMagicBytes } from "../file-validation";

// Helper to build a buffer with specific magic bytes padded to 12 bytes.
function makeBuffer(bytes: number[]): Buffer {
  const padded = [...bytes, ...new Array(Math.max(0, 12 - bytes.length)).fill(0)];
  return Buffer.from(padded);
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// RIFF (4) + size (4) + WEBP (4)
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
// ftyp at offset 4, brand "heic" at offset 8
const HEIC_MAGIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];
// ftyp at offset 4, brand "mif1" at offset 8
const HEIF_MAGIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31];
// SVG (XML text): "<svg"
const SVG_MAGIC = [0x3c, 0x73, 0x76, 0x67];
// Corrupt / random bytes
const CORRUPT = [0x00, 0x01, 0x02, 0x03];

describe("detectImageKind", () => {
  it("detects JPEG", () => {
    expect(detectImageKind(makeBuffer(JPEG_MAGIC))).toBe("jpeg");
  });

  it("detects PNG", () => {
    expect(detectImageKind(makeBuffer(PNG_MAGIC))).toBe("png");
  });

  it("detects WebP", () => {
    expect(detectImageKind(makeBuffer(WEBP_MAGIC))).toBe("webp");
  });

  it("detects HEIC", () => {
    expect(detectImageKind(makeBuffer(HEIC_MAGIC))).toBe("heic");
  });

  it("detects HEIF", () => {
    expect(detectImageKind(makeBuffer(HEIF_MAGIC))).toBe("heif");
  });

  it("rejects SVG (XML text)", () => {
    expect(detectImageKind(makeBuffer(SVG_MAGIC))).toBeNull();
  });

  it("rejects corrupt bytes", () => {
    expect(detectImageKind(makeBuffer(CORRUPT))).toBeNull();
  });

  it("rejects too-short buffer (< 12 bytes)", () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("rejects empty buffer", () => {
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe("validateImageMagicBytes", () => {
  it("returns valid=true with kind for JPEG", () => {
    const result = validateImageMagicBytes(makeBuffer(JPEG_MAGIC));
    expect(result).toEqual({ valid: true, kind: "jpeg" });
  });

  it("returns valid=false with no kind for SVG", () => {
    const result = validateImageMagicBytes(makeBuffer(SVG_MAGIC));
    expect(result).toEqual({ valid: false });
  });

  it("returns valid=false with no kind for too-short buffer", () => {
    const result = validateImageMagicBytes(Buffer.from([0x89, 0x50]));
    expect(result).toEqual({ valid: false });
  });
});
