/**
 * Share a card's vCard via the Web Share API when available, falling
 * back to a plain download of /api/cards/{id}/vcard. Returns a tag
 * telling the caller what happened so the UI can surface the right
 * toast.
 *
 *  - "shared"    → native share sheet completed successfully
 *  - "cancelled" → user dismissed the share sheet (AbortError)
 *  - "downloaded" → fallback path triggered (no Web Share support,
 *                   or share threw something non-abort)
 */

export type ShareOutcome = "shared" | "cancelled" | "downloaded";

export interface ShareCardDeps {
  /**
   * `fetch` indirection so tests can stub without touching the global.
   * Defaults to the window's `fetch` at call time.
   */
  fetchFn?: typeof fetch;
  /** Navigator to use. Defaults to `window.navigator`. */
  nav?: Navigator;
  /**
   * Fallback trigger when Web Share isn't available. Defaults to
   * `location.assign(url)` so the browser kicks a normal download.
   */
  fallbackDownload?: (url: string) => void;
}

export async function shareCardVcard(
  cardId: string,
  displayName: string,
  deps: ShareCardDeps = {},
): Promise<ShareOutcome> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const nav = deps.nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const fallback =
    deps.fallbackDownload ??
    ((url: string) => {
      if (typeof window !== "undefined") window.location.assign(url);
    });

  const url = `/api/cards/${encodeURIComponent(cardId)}/vcard`;

  // 1) Try Web Share API with a File payload.
  if (nav?.share && typeof nav.canShare === "function") {
    try {
      const res = await fetchFn(url);
      if (res.ok) {
        const blob = await res.blob();
        const filename = sanitizeFilename(displayName) + ".vcf";
        const file = new File([blob], filename, { type: "text/vcard" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({
            title: displayName || "名片",
            text: "名片分享",
            files: [file],
          });
          return "shared";
        }
      }
    } catch (err: unknown) {
      // User-initiated cancel is not an error condition.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Any other failure falls through to download.
    }
  }

  // 2) Fallback: plain download (behavior identical to existing 匯出 vCard).
  fallback(url);
  return "downloaded";
}

export function sanitizeFilename(raw: string): string {
  const safe = raw.replace(/[^A-Za-z0-9_\-\u3400-\u9fff]+/g, "_").slice(0, 80);
  // Treat all-separator leftovers ("_" or "") as empty so we never ship
  // a bare-separator filename.
  if (!safe || /^_+$/.test(safe)) return "contact";
  return safe;
}
