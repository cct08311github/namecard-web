import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";
import {
  cardsPath,
  personalWorkspaceId,
  SUB_COLLECTION_CARDS,
  COLLECTION_WORKSPACES,
} from "@/lib/firebase/shared";
import { syncWithFallback } from "@/lib/search/reconcile";

import type { CardCreateInput, CardUpdateInput } from "./schema";

/**
 * Card repository backed by Firestore Admin SDK.
 * All reads filter by memberUids so Security Rules + server validation agree.
 */

export type PhoneLabel = "mobile" | "office" | "home" | "fax" | "other";
export type EmailLabel = "work" | "personal" | "other";

export interface CardSummary {
  id: string;
  workspaceId: string;
  ownerUid: string;
  memberUids: string[];
  nameZh?: string;
  nameEn?: string;
  namePhonetic?: string;
  companyZh?: string;
  companyEn?: string;
  jobTitleZh?: string;
  jobTitleEn?: string;
  department?: string;
  whyRemember: string;
  firstMetDate?: string;
  firstMetContext?: string;
  firstMetEventTag?: string;
  notes?: string;
  tagIds: string[];
  tagNames: string[];
  phones: Array<{ label: PhoneLabel; value: string; primary?: boolean }>;
  emails: Array<{ label: EmailLabel; value: string; primary?: boolean }>;
  social?: Record<string, string | undefined>;
  frontImagePath?: string;
  backImagePath?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastContactedAt: Date | null;
  deletedAt: Date | null;
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function toSummary(id: string, data: FirebaseFirestore.DocumentData): CardSummary {
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
    phones: data.phones ?? [],
    emails: data.emails ?? [],
    social: data.social ?? {},
    frontImagePath: data.frontImagePath,
    backImagePath: data.backImagePath,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    lastContactedAt: tsToDate(data.lastContactedAt),
    deletedAt: tsToDate(data.deletedAt),
  };
}

interface ListOptions {
  limit?: number;
  orderBy?: "createdAt" | "lastContactedAt" | "updatedAt";
  order?: "asc" | "desc";
  includeDeleted?: boolean;
}

export async function listCardsForUser(
  uid: string,
  options: ListOptions = {},
): Promise<CardSummary[]> {
  const { limit = 200, orderBy = "createdAt", order = "desc", includeDeleted = false } = options;
  const db = getAdminFirestore();
  let query: FirebaseFirestore.Query = db
    .collectionGroup(SUB_COLLECTION_CARDS)
    .where("memberUids", "array-contains", uid);
  if (!includeDeleted) {
    // Firestore treats missing fields as != null for specific filters, so
    // only soft-delete check is via explicit exclusion at app level.
  }
  query = query.orderBy(orderBy, order).limit(limit);
  const snap = await query.get();
  return snap.docs
    .map((doc) => toSummary(doc.id, doc.data()))
    .filter((card) => includeDeleted || card.deletedAt === null);
}

export async function getCardForUser(uid: string, cardId: string): Promise<CardSummary | null> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const doc = await db.doc(`${cardsPath(wid)}/${cardId}`).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (!data.memberUids?.includes(uid)) return null;
  return toSummary(doc.id, data);
}

export interface CreateCardOptions {
  uid: string;
  displayName?: string;
}

export async function createCardForUser(
  input: CardCreateInput,
  { uid }: CreateCardOptions,
): Promise<{ id: string }> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const now = FieldValue.serverTimestamp();
  const ref = db.collection(cardsPath(wid)).doc();
  await ref.set({
    ...input,
    workspaceId: wid,
    ownerUid: uid,
    memberUids: [uid],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  // Re-read so serverTimestamp is resolved before we ship to Typesense;
  // sync failures degrade to the reconcile queue, they don't abort the
  // Firestore write.
  const snap = await ref.get();
  if (snap.exists) {
    await syncWithFallback(wid, "upsert", ref.id, toSummary(ref.id, snap.data()!));
  }
  return { id: ref.id };
}

export async function updateCardForUser(
  cardId: string,
  input: CardUpdateInput,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("名片不存在");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限修改此名片");
  await ref.update({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
    // Immutable fields — ignore if client tries to send them
    ownerUid: data.ownerUid,
    workspaceId: data.workspaceId,
    memberUids: data.memberUids,
  });
  const after = await ref.get();
  if (after.exists) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }
}

export async function softDeleteCardForUser(
  cardId: string,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("名片不存在");
  const data = snap.data()!;
  if (!data.memberUids?.includes(uid)) throw new Error("無權限刪除此名片");
  await ref.update({
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Soft-delete → remove from index; the reconciler handles any failure.
  await syncWithFallback(wid, "delete", cardId, null);
}

export async function touchLastContactedAt(
  cardId: string,
  { uid }: CreateCardOptions,
): Promise<void> {
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();
  const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
  await ref.update({
    lastContactedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Ranking signal changed — reindex so sort_by: lastContactedAt:desc
  // reflects the new contact event immediately.
  const after = await ref.get();
  if (after.exists && after.data()?.deletedAt === null) {
    await syncWithFallback(wid, "upsert", cardId, toSummary(cardId, after.data()!));
  }
}

export { COLLECTION_WORKSPACES, SUB_COLLECTION_CARDS };
