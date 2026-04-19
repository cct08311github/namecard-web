#!/usr/bin/env -S node --experimental-strip-types
/**
 * Dev / prod CLI: bootstrap the Typesense `cards` collection against
 * the configured Typesense instance. Safe to rerun — idempotent.
 * Invoked via `pnpm search:bootstrap`.
 *
 * Env resolution order (merge, first non-empty wins):
 *   .env.local → .env → .env.production
 * Dev contributors with a populated `.env.local` always win — they
 * stay pointed at Docker dev. On the Mac mini deploy box only
 * `.env.production` is populated, so it fills in the gaps. The
 * merge skips empty values so a stub `.env.local` with `KEY=` doesn't
 * shadow a real value in `.env.production`.
 */

import { existsSync, readFileSync } from "node:fs";

function mergeEnvFile(filepath: string): void {
  if (!existsSync(filepath)) return;
  const content = readFileSync(filepath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Only set if the key is missing or currently empty — skip explicit
    // empty stubs so they don't block values in later files.
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

for (const file of [".env.local", ".env", ".env.production"]) {
  mergeEnvFile(file);
}

// Self-contained REST implementation — intentionally avoids importing
// src/lib/search/bootstrap.ts (which depends on `server-only` + relative
// imports without .ts extensions, incompatible with Node 25's ESM loader
// under --experimental-strip-types). The schema itself is pure data and
// imports only `type`s from the typesense package, so it loads cleanly.
const { CARDS_COLLECTION_NAME, cardsCollectionSchema } =
  await import("../src/lib/search/schema.ts");

const host = process.env.TYPESENSE_HOST ?? "localhost";
const port = process.env.TYPESENSE_PORT ?? "8108";
const protocol = process.env.TYPESENSE_PROTOCOL ?? "http";
const apiKey = process.env.TYPESENSE_API_KEY;

if (!apiKey) {
  console.error(
    "[typesense] TYPESENSE_API_KEY is not set — add it to .env.local (dev) or .env.production (prod).",
  );
  process.exit(1);
}

const baseUrl = `${protocol}://${host}:${port}`;
const headers = { "X-TYPESENSE-API-KEY": apiKey, "Content-Type": "application/json" };

const probe = await fetch(`${baseUrl}/collections/${CARDS_COLLECTION_NAME}`, { headers });
if (probe.ok) {
  console.log(`[typesense] \`${CARDS_COLLECTION_NAME}\` collection already exists`);
  process.exit(0);
}
if (probe.status !== 404) {
  console.error(`[typesense] probe failed: HTTP ${probe.status} — ${await probe.text()}`);
  process.exit(1);
}

const create = await fetch(`${baseUrl}/collections`, {
  method: "POST",
  headers,
  body: JSON.stringify(cardsCollectionSchema),
});
if (!create.ok) {
  console.error(`[typesense] create failed: HTTP ${create.status} — ${await create.text()}`);
  process.exit(1);
}
console.log(`[typesense] created \`${CARDS_COLLECTION_NAME}\` collection`);
