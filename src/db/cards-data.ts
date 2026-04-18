import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import type { CardSummary, EmailLabel, PhoneLabel } from "./cards";

/**
 * Pure DocumentData → CardSummary mapper. Extracted so non-cards.ts
 * modules (search sync, tag propagation) can map without pulling the
 * full repository module.
 */

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export function toSummaryFromData(id: string, data: FirebaseFirestore.DocumentData): CardSummary {
  return {
    id,
    workspaceId: data.workspaceId,
    ownerUid: data.ownerUid,
    memberUids: data.memberUids ?? [],
    nameZh: data.nameZh,
    nameEn: data.nameEn,
    namePhonetic: data.namePhonetic,
    companyZh: data.companyZh,
    companyEn: data.companyEn,
    jobTitleZh: data.jobTitleZh,
    jobTitleEn: data.jobTitleEn,
    department: data.department,
    whyRemember: data.whyRemember ?? "",
    firstMetDate: data.firstMetDate,
    firstMetContext: data.firstMetContext,
    firstMetEventTag: data.firstMetEventTag,
    notes: data.notes,
    tagIds: data.tagIds ?? [],
    tagNames: data.tagNames ?? [],
    phones: (data.phones ?? []) as Array<{ label: PhoneLabel; value: string; primary?: boolean }>,
    emails: (data.emails ?? []) as Array<{ label: EmailLabel; value: string; primary?: boolean }>,
    social: data.social ?? {},
    frontImagePath: data.frontImagePath,
    backImagePath: data.backImagePath,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    lastContactedAt: tsToDate(data.lastContactedAt),
    deletedAt: tsToDate(data.deletedAt),
  };
}
