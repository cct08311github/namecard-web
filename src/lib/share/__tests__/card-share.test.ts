import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeFilename, shareCardVcard } from "../card-share";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubNavigator(partial: Partial<Navigator> & { share?: unknown; canShare?: unknown }) {
  return partial as Navigator;
}

function okResponse(body = "BEGIN:VCARD\r\nEND:VCARD\r\n"): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/vcard" } });
}

describe("shareCardVcard", () => {
  it("uses Web Share API when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const fallbackDownload = vi.fn();

    const outcome = await shareCardVcard("abc", "陳玉涵", {
      nav: stubNavigator({ share, canShare }),
      fetchFn,
      fallbackDownload,
    });

    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    const sharePayload = share.mock.calls[0][0] as { files: File[]; title: string };
    expect(sharePayload.title).toBe("陳玉涵");
    expect(sharePayload.files).toHaveLength(1);
    expect(sharePayload.files[0].name).toBe("陳玉涵.vcf");
    expect(fallbackDownload).not.toHaveBeenCalled();
  });

  it("falls back to download when navigator.share is missing", async () => {
    const fallbackDownload = vi.fn();
    const outcome = await shareCardVcard("abc", "Alice", {
      nav: stubNavigator({}),
      fallbackDownload,
    });
    expect(outcome).toBe("downloaded");
    expect(fallbackDownload).toHaveBeenCalledWith("/api/cards/abc/vcard");
  });

  it("falls back to download when canShare returns false for files", async () => {
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(false);
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const fallbackDownload = vi.fn();

    const outcome = await shareCardVcard("abc", "Alice", {
      nav: stubNavigator({ share, canShare }),
      fetchFn,
      fallbackDownload,
    });

    expect(outcome).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(fallbackDownload).toHaveBeenCalledOnce();
  });

  it("treats AbortError as 'cancelled' (user dismissed share sheet)", async () => {
    const abortErr = new Error("cancelled");
    abortErr.name = "AbortError";
    const share = vi.fn().mockRejectedValue(abortErr);
    const canShare = vi.fn().mockReturnValue(true);
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const fallbackDownload = vi.fn();

    const outcome = await shareCardVcard("abc", "Alice", {
      nav: stubNavigator({ share, canShare }),
      fetchFn,
      fallbackDownload,
    });

    expect(outcome).toBe("cancelled");
    expect(fallbackDownload).not.toHaveBeenCalled();
  });

  it("falls back to download on unexpected share errors", async () => {
    const share = vi.fn().mockRejectedValue(new Error("surprise"));
    const canShare = vi.fn().mockReturnValue(true);
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const fallbackDownload = vi.fn();

    const outcome = await shareCardVcard("abc", "Alice", {
      nav: stubNavigator({ share, canShare }),
      fetchFn,
      fallbackDownload,
    });

    expect(outcome).toBe("downloaded");
    expect(fallbackDownload).toHaveBeenCalledOnce();
  });

  it("falls back to download when fetch fails (non-ok response)", async () => {
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(true);
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const fallbackDownload = vi.fn();

    const outcome = await shareCardVcard("abc", "Alice", {
      nav: stubNavigator({ share, canShare }),
      fetchFn,
      fallbackDownload,
    });

    expect(outcome).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
  });
});

describe("sanitizeFilename", () => {
  it("keeps ASCII and CJK letters", () => {
    expect(sanitizeFilename("陳玉涵")).toBe("陳玉涵");
    expect(sanitizeFilename("Alice Chen")).toBe("Alice_Chen");
  });
  it("returns fallback when input stripped to empty", () => {
    expect(sanitizeFilename("///**")).toBe("contact");
  });
});
