import type { OcrFields } from "./types";

/**
 * Post-processing rules applied after raw OCR output lands. Strips obvious
 * nonsense (empty strings, extra whitespace), re-labels phones when the
 * label is missing-but-inferable (e.g. "行動 0912..." → mobile), and flags
 * low-confidence e-mails that don't even parse.
 *
 * Keep this idempotent + pure — a lot of downstream logic depends on
 * rerunning it safely.
 */

const MOBILE_HINTS_ZH = ["行動", "手機"];
const OFFICE_HINTS_ZH = ["公司", "辦公", "電話"];
const HOME_HINTS_ZH = ["住家", "宅"];
const FAX_HINTS = ["fax", "傳真"];

function dropEmptyTextFields<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [key, val] of Object.entries(out)) {
    if (val && typeof val === "object" && "value" in val) {
      const v = val as { value: unknown };
      if (typeof v.value !== "string" || v.value.trim() === "") {
        delete out[key];
      }
    }
  }
  return out as T;
}

function normalizePhoneLabel(raw: string, fallback = "other"): string {
  const s = raw.toLowerCase();
  if (MOBILE_HINTS_ZH.some((h) => raw.includes(h)) || /^09\d/.test(s)) return "mobile";
  if (OFFICE_HINTS_ZH.some((h) => raw.includes(h))) return "office";
  if (HOME_HINTS_ZH.some((h) => raw.includes(h))) return "home";
  if (FAX_HINTS.some((h) => s.includes(h.toLowerCase()))) return "fax";
  return fallback;
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function postProcess(fields: OcrFields): OcrFields {
  const cleaned = dropEmptyTextFields(fields);

  // Phones: normalize label
  cleaned.phones = (cleaned.phones ?? []).map((p) => ({
    ...p,
    label: (normalizePhoneLabel(p.value, p.label) ?? p.label) as
      | "mobile"
      | "office"
      | "home"
      | "fax"
      | "other",
    value: p.value.trim(),
  }));

  // Emails: strip whitespace, drop obviously bad entries
  cleaned.emails = (cleaned.emails ?? [])
    .map((e) => ({ ...e, value: e.value.trim() }))
    .filter((e) => e.value !== "");

  // Social: drop whitespace
  if (cleaned.social) {
    for (const key of Object.keys(cleaned.social)) {
      const k = key as keyof typeof cleaned.social;
      const f = cleaned.social[k];
      if (f && typeof f.value === "string") {
        f.value = f.value.trim();
      }
    }
  }

  return cleaned;
}

/** Returns email values that look malformed — surface these as low-confidence
 *  in the review UI so the user fixes them before saving. */
export function detectMalformedEmails(fields: OcrFields): string[] {
  return (fields.emails ?? []).map((e) => e.value).filter((v) => v && !isLikelyEmail(v));
}
