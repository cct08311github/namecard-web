/**
 * SIT harness for Typesense — skips the suite cleanly when the instance
 * isn't reachable (useful for local runs that haven't run `pnpm search:up`).
 *
 * Requires:
 *   TYPESENSE_HOST=localhost
 *   TYPESENSE_PORT=8108
 *   TYPESENSE_PROTOCOL=http
 *   TYPESENSE_API_KEY=local-dev-only-key
 *
 * CI sets these via docker compose service + workflow env; the SIT
 * vitest config forwards them to the test process.
 */

import { __recreateCardsCollectionForTest, ensureCardsCollection } from "@/lib/search/bootstrap";
import { __resetTypesenseClientForTest, getTypesenseClient } from "@/lib/search/client";
import { CARDS_COLLECTION_NAME } from "@/lib/search/schema";

export function isTypesenseConfigured(): boolean {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

/** Quick liveness check — retries a few times for Docker warmup. */
export async function waitForTypesense(timeoutMs = 15_000): Promise<boolean> {
  if (!isTypesenseConfigured()) return false;
  const client = getTypesenseClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await client.health.retrieve();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

/** Wipe + recreate the cards collection so each suite starts clean. */
export async function resetTypesense(): Promise<void> {
  await __recreateCardsCollectionForTest();
}

/** Ensure the cards collection exists (idempotent). */
export async function bootstrapTypesense(): Promise<void> {
  await ensureCardsCollection();
}

/** Reset singleton between tests so env changes take effect. */
export function resetClientSingleton(): void {
  __resetTypesenseClientForTest();
}

export { CARDS_COLLECTION_NAME };
