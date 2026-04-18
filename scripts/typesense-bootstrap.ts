#!/usr/bin/env -S node --experimental-strip-types
/**
 * Dev CLI: bootstrap the Typesense `cards` collection against the local
 * Docker instance. Safe to rerun — idempotent. Invoked via
 * `pnpm search:bootstrap`.
 *
 * Uses Node 22's native loadEnvFile so we don't pull in dotenv just for
 * a dev script. Silent if the env file is missing (matches Next's DX).
 */

import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { ensureCardsCollection } = await import("../src/lib/search/bootstrap.ts");

const result = await ensureCardsCollection();
if (result === "created") {
  console.log("[typesense] created `cards` collection");
} else {
  console.log("[typesense] `cards` collection already exists");
}
