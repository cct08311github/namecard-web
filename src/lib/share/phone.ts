/**
 * Phone number helpers for the share / public-profile surface.
 */

/**
 * Strip everything that is not a digit or a leading `+` so the value is safe
 * to embed in a `tel:` href. This prevents injecting arbitrary characters
 * (colons, slashes, spaces) that could form unintended URI schemes.
 *
 * Examples:
 *   "+1 (800) 123-4567"  →  "+18001234567"
 *   "0912-345-678"       →  "0912345678"
 *   "+886 912 345 678"   →  "+886912345678"
 */
export function sanitizePhoneForTelHref(value: string): string {
  // Keep the leading `+` (country-code prefix) then strip all non-digits.
  const hasLeadingPlus = value.trimStart().startsWith("+");
  const digitsOnly = value.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}
