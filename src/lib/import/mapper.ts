import { cardCreateSchema } from "@/db/schema";
import type { CardCreateInput } from "@/db/schema";
import type { ParsedVcard } from "@/lib/vcard/parse";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidMappedCardError extends Error {
  constructor(
    message: string,
    public readonly zodError: unknown,
  ) {
    super(message);
    this.name = "InvalidMappedCardError";
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Strip non-digit/+/- characters, collapse spaces, preserve leading +.
 */
export function normalizePhone(raw: string): string {
  // Remove parentheses and spaces around digits
  let s = raw.trim();
  // Remove chars that are not digit, +, -, space
  s = s.replace(/[^0-9+\-\s]/g, "");
  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Trim and lowercase an email address.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// CJK detection
// ---------------------------------------------------------------------------

function hasCjk(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

function resolveName(v: ParsedVcard): { nameZh?: string; nameEn?: string } {
  // Prefer N (structured name) when available
  if (v.nFamily || v.nGiven) {
    const isCjkFamily = hasCjk(v.nFamily ?? "");
    const isCjkGiven = hasCjk(v.nGiven ?? "");
    if (isCjkFamily || isCjkGiven) {
      // CJK convention: family + given without space
      const nameZh = `${v.nFamily ?? ""}${v.nGiven ?? ""}`.trim() || undefined;
      return { nameZh };
    } else {
      // Western convention: given + space + family
      const nameEn = `${v.nGiven ?? ""} ${v.nFamily ?? ""}`.trim() || undefined;
      return { nameEn };
    }
  }

  // Fall back to FN
  if (v.fn) {
    if (hasCjk(v.fn)) return { nameZh: v.fn };
    return { nameEn: v.fn };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Company / title resolution
// ---------------------------------------------------------------------------

function resolveCompany(v: ParsedVcard): { companyZh?: string; companyEn?: string } {
  if (!v.org) return {};
  if (hasCjk(v.org)) {
    return { companyZh: v.org, companyEn: v.orgEn };
  }
  return { companyEn: v.org };
}

function resolveTitle(v: ParsedVcard): { jobTitleZh?: string; jobTitleEn?: string } {
  if (!v.title) return {};
  if (hasCjk(v.title)) {
    return { jobTitleZh: v.title, jobTitleEn: v.titleEn };
  }
  return { jobTitleEn: v.title, jobTitleZh: undefined };
}

// ---------------------------------------------------------------------------
// Phone deduplication
// ---------------------------------------------------------------------------

function dedupePhones(phones: ParsedVcard["phones"]): ParsedVcard["phones"] {
  const seen = new Set<string>();
  return phones.filter((p) => {
    const key = p.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEmails(emails: ParsedVcard["emails"]): ParsedVcard["emails"] {
  const seen = new Set<string>();
  return emails.filter((e) => {
    const key = e.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

/**
 * Convert a ParsedVcard into a CardCreateInput.
 * Throws InvalidMappedCardError if the result fails Zod validation.
 */
export function vcardToCardCreateInput(v: ParsedVcard): CardCreateInput {
  const { nameZh, nameEn } = resolveName(v);
  const { companyZh, companyEn } = resolveCompany(v);
  const { jobTitleZh, jobTitleEn } = resolveTitle(v);

  const phones = dedupePhones(
    v.phones
      .map((p) => ({
        label: p.label,
        value: normalizePhone(p.value),
      }))
      .filter((p) => p.value.length > 0),
  );

  const emails = dedupeEmails(
    v.emails
      .map((e) => ({
        label: e.label,
        value: normalizeEmail(e.value),
      }))
      .filter((e) => e.value.length > 0),
  );

  const input = {
    nameZh,
    nameEn,
    namePhonetic: v.nPhonetic,
    companyZh,
    companyEn,
    jobTitleZh,
    jobTitleEn,
    department: v.department,
    phones,
    emails,
    addresses: [] as const,
    social: {},
    tagIds: [] as const,
    tagNames: v.categories,
    whyRemember: "來自 vCard 匯入",
    firstMetDate: v.firstMetDate,
    firstMetContext: v.firstMetContext,
    notes: v.note,
    companyWebsite: v.url,
  };

  const parsed = cardCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidMappedCardError(
      `vCard mapping produced invalid card: ${parsed.error.message}`,
      parsed.error,
    );
  }

  return parsed.data;
}
