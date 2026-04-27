import { describe, it, expect } from "vitest";

import { validateImageMagicBytes } from "../file-validation";

function buf(hex: string): Buffer {
  return Buffer.from(hex.replace(/\s/g, ""), "hex");
}

describe("validateImageMagicBytes", () => {
  it("accepts a JPEG (FF D8 FF E0)", () => {
    const result = validateImageMagicBytes(buf("FFD8FFE0 00104A46 4946000"));
    expect(result.valid).toBe(true);
    expect(result.detectedKind).toBe("jpeg");
  });

  it("accepts a PNG (89 50 4E 47 0D 0A 1A 0A + padding)", () => {
    const result = validateImageMagicBytes(buf("89504E47 0D0A1A0A 00000000"));
    expect(result.valid).toBe(true);
    expect(result.detectedKind).toBe("png");
  });

  it("accepts a WebP (RIFF????WEBP)", () => {
    // RIFF + 4 size bytes + WEBP
    const b = Buffer.alloc(12);
    b.write("RIFF", 0, "ascii");
    b.writeUInt32LE(100, 4); // arbitrary size
    b.write("WEBP", 8, "ascii");
    const result = validateImageMagicBytes(b);
    expect(result.valid).toBe(true);
    expect(result.detectedKind).toBe("webp");
  });

  it("accepts a HEIC file (ftyp + heic brand)", () => {
    const b = Buffer.alloc(12);
    b.writeUInt32BE(24, 0); // box size (arbitrary)
    b.write("ftyp", 4, "ascii");
    b.write("heic", 8, "ascii");
    const result = validateImageMagicBytes(b);
    expect(result.valid).toBe(true);
    expect(result.detectedKind).toBe("heic");
  });

  it("accepts a HEIF file (ftyp + msf1 brand)", () => {
    const b = Buffer.alloc(12);
    b.writeUInt32BE(24, 0);
    b.write("ftyp", 4, "ascii");
    b.write("msf1", 8, "ascii");
    const result = validateImageMagicBytes(b);
    expect(result.valid).toBe(true);
    expect(result.detectedKind).toBe("heif");
  });

  it("rejects an SVG (text/xml-like bytes)", () => {
    const svgBuf = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "utf8");
    const result = validateImageMagicBytes(svgBuf);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/svg is rejected/i);
  });

  it("rejects a GIF (unsupported)", () => {
    const gifBuf = buf("47494638 39610100 0100D500");
    const result = validateImageMagicBytes(gifBuf);
    expect(result.valid).toBe(false);
  });

  it("rejects a PDF (unsupported)", () => {
    const pdfBuf = Buffer.from("%PDF-1.4 .... rest of content", "ascii");
    const result = validateImageMagicBytes(pdfBuf);
    expect(result.valid).toBe(false);
  });

  it("rejects a buffer that is too small", () => {
    const result = validateImageMagicBytes(Buffer.from([0xff, 0xd8]));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too small/i);
  });

  it("rejects a zero-length buffer", () => {
    const result = validateImageMagicBytes(Buffer.alloc(0));
    expect(result.valid).toBe(false);
  });
});
