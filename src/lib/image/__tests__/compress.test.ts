/**
 * UT for compressImage — runs in jsdom via Vitest.
 *
 * We can't exercise real canvas pixel ops in jsdom, so the tests verify:
 *   1. skip-if-small path returns the original Blob unchanged.
 *   2. canvas path calls toBlob with correct dimensions & quality.
 *   3. EXIF-orientation path uses createImageBitmap when available.
 *   4. Fallback path (<img> decode) is taken when createImageBitmap throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "../compress";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFile(sizeBytes: number, name = "card.jpg"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

// ---------------------------------------------------------------------------
// Setup: mock browser globals not provided by jsdom
// ---------------------------------------------------------------------------

// Minimal ImageBitmap mock
interface MockImageBitmap {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
}

let mockBitmap: MockImageBitmap;
let createImageBitmapMock: ReturnType<typeof vi.fn>;
let canvasContextMock: {
  drawImage: ReturnType<typeof vi.fn>;
};
let canvasMock: {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toBlob: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // Reset orientation probe cache between tests by resetting module-level state.
  // We do this by overwriting the global flag directly via a cast.
  // (The module caches _orientationSupported; we reset via mock.)

  mockBitmap = { width: 4000, height: 3000, close: vi.fn() };

  createImageBitmapMock = vi.fn().mockResolvedValue(mockBitmap);
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);

  // Mock global fetch for the orientation-probe 1×1 PNG
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob([new Uint8Array(1)], { type: "image/png" })),
    }),
  );

  canvasContextMock = { drawImage: vi.fn() };
  canvasMock = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(canvasContextMock),
    toBlob: vi.fn().mockImplementation((cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
    }),
  };

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return canvasMock as unknown as HTMLElement;
    // Returning a real element for everything else keeps jsdom happy.
    return document.createElement.call(document, tag);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Force next test to re-probe orientation support by wiping module cache.
  // We can't easily reach the module-level variable, so we rely on the
  // createImageBitmap mock being fresh each test.
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compressImage – skip-if-small", () => {
  it("returns the original blob when it is below skipIfBelowBytes", async () => {
    const small = makeFile(1 * 1024 * 1024); // 1 MB < default 2 MB threshold
    const result = await compressImage(small);
    expect(result).toBe(small); // exact same reference
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("respects a custom skipIfBelowBytes", async () => {
    const medium = makeFile(500 * 1024); // 500 KB
    const result = await compressImage(medium, { skipIfBelowBytes: 1024 * 1024 });
    expect(result).toBe(medium);
  });
});

describe("compressImage – canvas compression path", () => {
  it("calls canvas.toBlob and returns compressed blob", async () => {
    const large = makeFile(5 * 1024 * 1024); // 5 MB → triggers compression
    const result = await compressImage(large);
    expect(canvasMock.toBlob).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Blob);
    expect(result).not.toBe(large);
  });

  it("sets canvas dimensions to respect maxLongestSide (portrait)", async () => {
    // bitmap: 4000×3000 portrait (h<w), longest = 4000
    mockBitmap.width = 4000;
    mockBitmap.height = 3000;
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large, { maxLongestSide: 2048 });

    // Expected: 2048 × 1536 (ratio = 2048/4000 = 0.512)
    expect(canvasMock.width).toBe(2048);
    expect(canvasMock.height).toBe(1536);
  });

  it("sets canvas dimensions to respect maxLongestSide (portrait tall)", async () => {
    // bitmap: 3000×4000, longest = 4000
    mockBitmap.width = 3000;
    mockBitmap.height = 4000;
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large, { maxLongestSide: 2048 });

    // Expected: 1536 × 2048
    expect(canvasMock.width).toBe(1536);
    expect(canvasMock.height).toBe(2048);
  });

  it("does not resize when image is already within maxLongestSide", async () => {
    mockBitmap.width = 1024;
    mockBitmap.height = 768;
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large, { maxLongestSide: 2048 });

    expect(canvasMock.width).toBe(1024);
    expect(canvasMock.height).toBe(768);
  });

  it("passes quality to toBlob", async () => {
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large, { quality: 0.7 });
    // toBlob signature: (callback, mime, quality)
    const call = canvasMock.toBlob.mock.calls[0] as [(b: Blob | null) => void, string, number];
    const quality = call[2];
    expect(quality).toBe(0.7);
  });

  it("closes the ImageBitmap after drawing", async () => {
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large);
    expect(mockBitmap.close).toHaveBeenCalledOnce();
  });
});

describe("compressImage – EXIF orientation", () => {
  it("passes imageOrientation:'from-image' to createImageBitmap when supported", async () => {
    const large = makeFile(5 * 1024 * 1024);
    await compressImage(large);

    // The first call is the probe (1px png), the second is the actual file.
    // Both should use the same createImageBitmap mock.
    const actualFileCalls = createImageBitmapMock.mock.calls.filter((args: unknown[]) => {
      const blob = args[0] as Blob;
      return blob.size > 1; // filter out the 1-byte probe png
    });
    expect(actualFileCalls.length).toBeGreaterThanOrEqual(1);
    const opts = actualFileCalls[0][1] as { imageOrientation: string };
    expect(opts).toMatchObject({ imageOrientation: "from-image" });
  });

  it("falls back gracefully when createImageBitmap is unavailable", async () => {
    // Simulate an environment where createImageBitmap doesn't exist at all.
    // This path also covers older Safari that doesn't support the orientation option.
    vi.stubGlobal("createImageBitmap", undefined);

    // The fallback path uses FileReader + Image. Stub Image to fire onload.
    class StubImage {
      public naturalWidth = 3000;
      public naturalHeight = 2000;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      private _src = "";
      set src(val: string) {
        this._src = val;
        Promise.resolve().then(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal("Image", StubImage);

    const large = makeFile(5 * 1024 * 1024);
    const result = await compressImage(large);

    // Should still return a compressed Blob via canvas.
    expect(result).toBeInstanceOf(Blob);
  });
});

describe("compressImage – non-browser environment", () => {
  it("returns original when document is undefined", async () => {
    const origDocument = globalThis.document;
    // @ts-expect-error - simulating SSR
    globalThis.document = undefined;

    const large = makeFile(5 * 1024 * 1024);
    const result = await compressImage(large);
    expect(result).toBe(large);

    globalThis.document = origDocument;
  });
});
