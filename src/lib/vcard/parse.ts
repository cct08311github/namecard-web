import { parseVCards } from "vcard4-ts";
import type { VCard4, SingleVCardProperty, VCardParameters } from "vcard4-ts";

/**
 * Parsed intermediate representation extracted from a single vCard.
 * PHOTO is intentionally discarded — MVP does not import images.
 */
export interface ParsedVcard {
  fn?: string;
  nFamily?: string;
  nGiven?: string;
  nPhonetic?: string;
  org?: string;
  orgEn?: string;
  title?: string;
  titleEn?: string;
  department?: string;
  phones: Array<{ label: "mobile" | "office" | "home" | "fax" | "other"; value: string }>;
  emails: Array<{ label: "work" | "personal" | "other"; value: string }>;
  url?: string;
  note?: string;
  categories: string[];
  firstMetDate?: string;
  firstMetContext?: string;
}

// ---------------------------------------------------------------------------
// Label inference helpers
// ---------------------------------------------------------------------------

function inferPhoneLabel(
  params: VCardParameters | undefined,
): "mobile" | "office" | "home" | "fax" | "other" {
  if (!params?.TYPE) return "other";
  const types = params.TYPE.map((t) => t.toLowerCase());
  if (types.some((t) => t === "cell" || t === "mobile")) return "mobile";
  if (types.some((t) => t === "fax")) return "fax";
  if (types.some((t) => t === "home")) return "home";
  if (types.some((t) => t === "work" || t === "voice")) return "office";
  return "other";
}

function inferEmailLabel(params: VCardParameters | undefined): "work" | "personal" | "other" {
  if (!params?.TYPE) return "other";
  const types = params.TYPE.map((t) => t.toLowerCase());
  if (types.some((t) => t === "work")) return "work";
  if (types.some((t) => t === "home" || t === "personal")) return "personal";
  return "other";
}

// ---------------------------------------------------------------------------
// QUOTED-PRINTABLE decoder
// ---------------------------------------------------------------------------

function decodeQuotedPrintable(value: string): string {
  // Soft line breaks: =\r\n or =\n
  return value
    .replace(/=\r\n/g, "")
    .replace(/=\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// ---------------------------------------------------------------------------
// Line unfolding (RFC 6350 §3.2)
// ---------------------------------------------------------------------------

function unfoldLines(text: string): string {
  // Normalize line endings to LF, then unfold CRLF or LF followed by space/tab
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

// ---------------------------------------------------------------------------
// X-property helpers
// ---------------------------------------------------------------------------

function getXValue(card: VCard4, key: string): string | undefined {
  const upperKey = key.toUpperCase();
  const entries = card.x?.[upperKey];
  if (!entries || entries.length === 0) return undefined;
  return entries[0].value || undefined;
}

// ---------------------------------------------------------------------------
// Single-card mapper
// ---------------------------------------------------------------------------

function extractSingleVcard(card: VCard4): ParsedVcard {
  // FN (required by spec, always an array with at least one entry)
  const fnValue = card.FN?.[0]?.value ?? undefined;

  // N
  const nField = card.N?.value;
  const nFamily = nField?.familyNames?.[0] ?? undefined;
  const nGiven = nField?.givenNames?.[0] ?? undefined;

  // Phonetic: X-PHONETIC-FIRST-NAME or X-PHONETIC-LAST-NAME
  const nPhonetic =
    getXValue(card, "X-PHONETIC-FIRST-NAME") ??
    getXValue(card, "X-PHONETIC-LAST-NAME") ??
    undefined;

  // ORG: first segment = org, second segment = department/orgEn
  const orgValue = card.ORG?.[0]?.value;
  const org = orgValue?.[0] ?? undefined;
  const orgSecond = orgValue?.[1] ?? undefined;

  // Determine whether second org segment looks like English or department
  const orgEn = orgSecond && !hasCjk(orgSecond) ? orgSecond : undefined;
  const department =
    getXValue(card, "X-DEPARTMENT") ?? (orgSecond && hasCjk(orgSecond) ? orgSecond : undefined);

  // TITLE
  const title = card.TITLE?.[0]?.value ?? undefined;
  const titleEn = getXValue(card, "X-TITLE-EN") ?? undefined;

  // TEL
  const phones: ParsedVcard["phones"] = (card.TEL ?? [])
    .map((entry: SingleVCardProperty<string>) => ({
      label: inferPhoneLabel(entry.parameters),
      value: maybeDecodeQP(entry.parameters, entry.value),
    }))
    .filter((p) => p.value.trim() !== "");

  // EMAIL
  const emails: ParsedVcard["emails"] = (card.EMAIL ?? [])
    .map((entry: SingleVCardProperty<string>) => ({
      label: inferEmailLabel(entry.parameters),
      value: maybeDecodeQP(entry.parameters, entry.value),
    }))
    .filter((e) => e.value.trim() !== "");

  // URL
  const url = card.URL?.[0]?.value ?? undefined;

  // NOTE
  const rawNote = card.NOTE?.[0]?.value;
  const note = rawNote ? maybeDecodeQP(card.NOTE![0].parameters, rawNote) : undefined;

  // CATEGORIES
  const categories = card.CATEGORIES?.[0]?.value ?? [];

  // X custom fields
  const firstMetDate = normalizeXDate(getXValue(card, "X-FIRST-MET-DATE"));
  const firstMetContext = getXValue(card, "X-FIRST-MET-CONTEXT") ?? undefined;

  return {
    fn: fnValue,
    nFamily: nFamily || undefined,
    nGiven: nGiven || undefined,
    nPhonetic,
    org: org || undefined,
    orgEn,
    title: title || undefined,
    titleEn,
    department: department || undefined,
    phones,
    emails,
    url: url || undefined,
    note: note || undefined,
    categories: [...categories],
    firstMetDate,
    firstMetContext,
  };
}

function maybeDecodeQP(params: VCardParameters | undefined, value: string): string {
  // vcard4-ts handles most encoding, but some v2.1 files use QUOTED-PRINTABLE
  const encoding = (params as Record<string, unknown> | undefined)?.["ENCODING"];
  if (typeof encoding === "string" && encoding.toUpperCase() === "QUOTED-PRINTABLE") {
    return decodeQuotedPrintable(value);
  }
  return value;
}

function normalizeXDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Accept YYYY-MM-DD or YYYYMMDD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return undefined;
}

function hasCjk(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a vCard file (potentially containing multiple vCards) into an array
 * of ParsedVcard objects. Returns [] on complete parse failure; never throws
 * unless the input is corrupt UTF-8 (which JS handles at Buffer decode time).
 */
export function parseVcardFile(text: string): ParsedVcard[] {
  try {
    const unfolded = unfoldLines(text);
    const result = parseVCards(unfolded, /* keepDefective */ true);
    if (!result.vCards) return [];
    return result.vCards.map(extractSingleVcard);
  } catch {
    return [];
  }
}
