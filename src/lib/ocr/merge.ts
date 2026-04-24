import type { CardUpdateInput } from "@/db/schema";
import type { OcrFields } from "./types";

export type MergeStrategy = "fill-empty" | "overwrite";

type Current = Partial<CardUpdateInput>;

/**
 * Merge OCR-extracted fields into an existing card's values, producing
 * a CardUpdateInput payload suitable for updateCardAction.
 *
 *  - fill-empty (default, recommended): only set fields that the
 *    current card has left blank (string "" / null / undefined, or
 *    empty phones/emails arrays). Non-empty current values are left
 *    intact.
 *  - overwrite: every OCR-detected field replaces the current value.
 *    Empty OCR fields never overwrite non-empty current values —
 *    absence of signal is never a reason to wipe data.
 */
export function mergeOcrIntoExisting(
  current: Current,
  ocr: OcrFields,
  strategy: MergeStrategy = "fill-empty",
): CardUpdateInput {
  const patch: CardUpdateInput = {};

  assignString(patch, current, "nameZh", ocr.nameZh?.value, strategy);
  assignString(patch, current, "nameEn", ocr.nameEn?.value, strategy);
  assignString(patch, current, "namePhonetic", ocr.namePhonetic?.value, strategy);
  assignString(patch, current, "jobTitleZh", ocr.jobTitleZh?.value, strategy);
  assignString(patch, current, "jobTitleEn", ocr.jobTitleEn?.value, strategy);
  assignString(patch, current, "department", ocr.department?.value, strategy);
  assignString(patch, current, "companyZh", ocr.companyZh?.value, strategy);
  assignString(patch, current, "companyEn", ocr.companyEn?.value, strategy);

  const ocrPhones = (ocr.phones ?? []).map((p) => ({ label: p.label, value: p.value }));
  if (ocrPhones.length > 0 && shouldAssignArray(current.phones, strategy)) {
    patch.phones = ocrPhones;
  }
  const ocrEmails = (ocr.emails ?? []).map((e) => ({ label: e.label, value: e.value }));
  if (ocrEmails.length > 0 && shouldAssignArray(current.emails, strategy)) {
    patch.emails = ocrEmails;
  }

  const social: NonNullable<CardUpdateInput["social"]> = { ...(current.social ?? {}) };
  const socialPatch: NonNullable<CardUpdateInput["social"]> = {};
  assignSocial(socialPatch, social, "lineId", ocr.social?.lineId?.value, strategy);
  assignSocial(socialPatch, social, "wechatId", ocr.social?.wechatId?.value, strategy);
  assignSocial(socialPatch, social, "linkedinUrl", ocr.social?.linkedinUrl?.value, strategy);
  if (Object.keys(socialPatch).length > 0) {
    patch.social = { ...social, ...socialPatch };
  }

  return patch;
}

/** Count of fields that would actually change under the given strategy. */
export function countAffectedFields(
  current: Current,
  ocr: OcrFields,
  strategy: MergeStrategy = "fill-empty",
): number {
  return Object.keys(mergeOcrIntoExisting(current, ocr, strategy)).length;
}

function assignString(
  patch: CardUpdateInput,
  current: Current,
  key: keyof Pick<
    CardUpdateInput,
    | "nameZh"
    | "nameEn"
    | "namePhonetic"
    | "jobTitleZh"
    | "jobTitleEn"
    | "department"
    | "companyZh"
    | "companyEn"
  >,
  ocrValue: string | undefined,
  strategy: MergeStrategy,
): void {
  if (!ocrValue) return;
  const existing = current[key];
  if (strategy === "fill-empty" && existing) return;
  patch[key] = ocrValue;
}

function assignSocial(
  patch: NonNullable<CardUpdateInput["social"]>,
  current: NonNullable<CardUpdateInput["social"]>,
  key: "lineId" | "wechatId" | "linkedinUrl",
  ocrValue: string | undefined,
  strategy: MergeStrategy,
): void {
  if (!ocrValue) return;
  const existing = current[key];
  if (strategy === "fill-empty" && existing) return;
  patch[key] = ocrValue;
}

function shouldAssignArray<T>(current: T[] | undefined, strategy: MergeStrategy): boolean {
  if (strategy === "overwrite") return true;
  return !current || current.length === 0;
}
