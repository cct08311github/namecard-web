/**
 * Helpers for checking whether an email is in the ALLOWED_EMAILS whitelist.
 *
 * ALLOWED_EMAILS is a comma-separated list of lowercase email addresses set
 * as an environment variable. Both server-side and test code use these helpers.
 */

export function getAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string): boolean {
  return getAllowedEmails().has(email.trim().toLowerCase());
}
