import "server-only";

import { getTypesenseClient } from "./client";
import { CARDS_COLLECTION_NAME, cardsCollectionSchema } from "./schema";

/**
 * Ensure the `cards` collection exists on the configured Typesense
 * instance. Idempotent — safe to call on every boot or from the dev CLI.
 *
 * Returns the action taken so callers can log / surface it:
 *   - "created"   — collection didn't exist, created from schema
 *   - "existing"  — already there, left alone
 */

export type EnsureResult = "created" | "existing";

export async function ensureCardsCollection(): Promise<EnsureResult> {
  const client = getTypesenseClient();
  try {
    await client.collections(CARDS_COLLECTION_NAME).retrieve();
    return "existing";
  } catch (err: unknown) {
    // Typesense returns ObjectNotFound (HTTP 404) when the collection
    // is absent. Any other error bubbles — we don't want silent creates
    // on network flakes.
    const httpStatus = (err as { httpStatus?: number })?.httpStatus;
    if (httpStatus !== 404) throw err;
  }

  await client.collections().create(cardsCollectionSchema);
  return "created";
}

/**
 * Drop + recreate the collection. Dev / SIT only — NEVER call in prod.
 * Used by the SIT harness to reset state between tests.
 */
export async function __recreateCardsCollectionForTest(): Promise<void> {
  const client = getTypesenseClient();
  try {
    await client.collections(CARDS_COLLECTION_NAME).delete();
  } catch (err: unknown) {
    const httpStatus = (err as { httpStatus?: number })?.httpStatus;
    if (httpStatus !== 404) throw err;
  }
  await client.collections().create(cardsCollectionSchema);
}
