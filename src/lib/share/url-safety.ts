/**
 * URL safety helpers.
 *
 * Provides a belt-and-suspenders scheme allowlist to prevent
 * javascript: / data: / vbscript: XSS via stored URLs that get rendered
 * into <a href="...">. Applied at both schema validation (Zod) and render
 * time (safeExternalUrl).
 */

const ALLOWED_SCHEMES = ["http:", "https:", "mailto:", "tel:"] as const;

/**
 * Returns the URL unchanged when its scheme is in the allowlist;
 * returns null for anything else (javascript:, data:, vbscript:, etc.)
 * or for values that cannot be parsed as a URL.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (ALLOWED_SCHEMES.some((s) => parsed.protocol === s)) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Zod refinement — true when the value is absent OR passes the scheme check.
 * Use inside .refine() on optional URL fields.
 */
export function isAllowedUrlOrEmpty(value: string | undefined): boolean {
  if (!value) return true;
  return safeExternalUrl(value) !== null;
}
