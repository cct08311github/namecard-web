/**
 * URL safety helpers — allowlist-based scheme validation.
 *
 * Used to prevent XSS via javascript: / data: / vbscript: / file: URLs
 * embedded in social or website link fields (P1 finding, #248).
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Returns the URL unchanged if its scheme is in the allowlist,
 * or null if the scheme is disallowed, the URL is malformed, or the
 * value is empty / null / undefined.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return ALLOWED_SCHEMES.has(u.protocol) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Zod `.refine()` predicate — allows empty strings (optional fields)
 * and validates non-empty values against the scheme allowlist.
 */
export function isAllowedUrlOrEmpty(value: string): boolean {
  if (value.trim() === "") return true;
  return safeExternalUrl(value) !== null;
}
