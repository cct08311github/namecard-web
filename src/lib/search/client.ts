import "server-only";

import Typesense, { Client } from "typesense";

/**
 * Resolve the Typesense client singleton. Reads connection from env:
 *   TYPESENSE_HOST      — e.g. "localhost" or "typesense.example.ts.net"
 *   TYPESENSE_PORT      — default 8108
 *   TYPESENSE_PROTOCOL  — "http" (default, local Docker) or "https" (tailnet/prod)
 *   TYPESENSE_API_KEY   — required
 *
 * Fails fast when the API key is missing so a misconfigured server action
 * never silently writes to a rogue instance.
 */

let cached: Client | undefined;

export function getTypesenseClient(): Client {
  if (cached) return cached;

  const host = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!host) throw new Error("TYPESENSE_HOST is not configured");
  if (!apiKey) throw new Error("TYPESENSE_API_KEY is not configured");

  const port = Number(process.env.TYPESENSE_PORT ?? 8108);
  const protocol = (process.env.TYPESENSE_PROTOCOL ?? "http") as "http" | "https";

  cached = new Typesense.Client({
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 5,
    numRetries: 2,
    retryIntervalSeconds: 0.1,
  });
  return cached;
}

/**
 * Test hook — let SIT swap or clear the singleton between runs.
 * Never exported from the barrel; imported directly by the SIT harness.
 */
export function __resetTypesenseClientForTest(): void {
  cached = undefined;
}
