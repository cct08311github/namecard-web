import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { CardCreateInput } from "@/db/schema";
import { getAdminFirestore } from "@/lib/firebase/server";
import { cardsPath, personalWorkspaceId } from "@/lib/firebase/shared";
import { syncWithFallback } from "@/lib/search/reconcile";

import { toSummaryFromData } from "./cards-data";
import { updateCardForUser } from "./cards";
import { chunkArray, runParallelLimited } from "./_utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportDecision =
  | { kind: "create" }
  | { kind: "skip" }
  | { kind: "merge"; cardId: string };

export interface BatchImportInput {
  rows: CardCreateInput[];
  decisions: ImportDecision[];
}

export interface BatchImportResult {
  created: number;
  merged: number;
  skipped: number;
  createdIds: string[];
  errors: Array<{ rowIndex: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREATE_CHUNK = 400;
const REINDEX_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Batch-create / merge / skip cards for a user, maintaining all Phase 4
 * invariants: memberUids denorm, soft-delete null, Typesense reconcile.
 *
 * Creates path: Firestore WriteBatch (chunked at 400) → re-read → Typesense sync.
 * Merge path: fill empty fields on target card, then call updateCardForUser.
 * Skip path: no-op.
 *
 * Per-row errors are collected; the function only throws on malformed input.
 */
export async function batchCreateCardsForUser(
  input: BatchImportInput,
  options: { uid: string },
): Promise<BatchImportResult> {
  if (input.rows.length !== input.decisions.length) {
    throw new Error("rows and decisions length must match");
  }

  const { uid } = options;
  const wid = personalWorkspaceId(uid);
  const db = getAdminFirestore();

  const result: BatchImportResult = {
    created: 0,
    merged: 0,
    skipped: 0,
    createdIds: [],
    errors: [],
  };

  // ------------------------------------------------------------------
  // 1. Partition rows by decision kind
  // ------------------------------------------------------------------

  const createItems: Array<{ rowIndex: number; row: CardCreateInput }> = [];
  const mergeItems: Array<{ rowIndex: number; row: CardCreateInput; cardId: string }> = [];

  for (let i = 0; i < input.rows.length; i++) {
    const decision = input.decisions[i]!;
    const row = input.rows[i]!;

    switch (decision.kind) {
      case "create":
        createItems.push({ rowIndex: i, row });
        break;
      case "merge":
        mergeItems.push({ rowIndex: i, row, cardId: decision.cardId });
        break;
      case "skip":
        result.skipped++;
        break;
    }
  }

  // ------------------------------------------------------------------
  // 2. Creates — chunked WriteBatch + parallel reindex
  // ------------------------------------------------------------------

  const chunks = chunkArray(createItems, CREATE_CHUNK);

  for (const chunk of chunks) {
    // Build doc refs first so we can batch.set then reindex.
    const refs = chunk.map(() => db.collection(cardsPath(wid)).doc());

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    for (let ci = 0; ci < chunk.length; ci++) {
      const { row } = chunk[ci]!;
      const ref = refs[ci]!;
      batch.set(ref, {
        ...row,
        workspaceId: wid,
        ownerUid: uid,
        memberUids: [uid],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      // Record errors per row in the chunk and continue with next chunk.
      for (const item of chunk) {
        result.errors.push({
          rowIndex: item.rowIndex,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Re-read and reindex (parallel-limited to 4 concurrent).
    await runParallelLimited(
      chunk.map((item, ci) => ({ item, ref: refs[ci]! })),
      REINDEX_CONCURRENCY,
      async ({ item, ref }) => {
        try {
          const snap = await ref.get();
          if (!snap.exists) return;
          const data = snap.data()!;
          await syncWithFallback(wid, "upsert", ref.id, toSummaryFromData(ref.id, data));
          result.created++;
          result.createdIds.push(ref.id);
        } catch (err) {
          result.errors.push({
            rowIndex: item.rowIndex,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
  }

  // ------------------------------------------------------------------
  // 3. Merges — serial (rare); fill empty fields on target
  // ------------------------------------------------------------------

  for (const { rowIndex, row, cardId } of mergeItems) {
    try {
      const ref = db.doc(`${cardsPath(wid)}/${cardId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        result.errors.push({ rowIndex, message: `merge target ${cardId} not found` });
        continue;
      }

      const existing = snap.data()!;

      // Merge semantics: existing non-empty values win; incoming fills gaps.
      const merged: Partial<CardCreateInput> = { ...row };

      // Scalar string fields: keep existing when non-empty.
      const stringFields: Array<keyof CardCreateInput> = [
        "nameZh",
        "nameEn",
        "namePhonetic",
        "companyZh",
        "companyEn",
        "jobTitleZh",
        "jobTitleEn",
        "department",
        "companyWebsite",
        "firstMetDate",
        "firstMetContext",
        "firstMetEventTag",
        "notes",
        "whyRemember",
      ];

      for (const field of stringFields) {
        const existingVal = existing[field];
        if (existingVal && typeof existingVal === "string" && existingVal.trim()) {
          (merged as Record<string, unknown>)[field] = existingVal;
        }
      }

      // Array fields: keep existing when non-empty.
      if (existing.phones?.length > 0) merged.phones = existing.phones;
      if (existing.emails?.length > 0) merged.emails = existing.emails;
      if (existing.tagIds?.length > 0) {
        merged.tagIds = existing.tagIds;
        merged.tagNames = existing.tagNames ?? [];
      }

      await updateCardForUser(cardId, merged, { uid });
      result.merged++;
    } catch (err) {
      result.errors.push({
        rowIndex,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
