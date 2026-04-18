/**
 * Vitest setup file for SIT runs. If you can see this warning and the tests
 * are getting skipped with describe.skip, it means vitest workers didn't
 * inherit the emulator env vars — this file fixes that by re-reading them.
 *
 * `firebase emulators:exec` injects:
 *   FIRESTORE_EMULATOR_HOST
 *   FIREBASE_AUTH_EMULATOR_HOST
 *   GCLOUD_PROJECT
 * into the child process. Vitest workers should inherit them naturally,
 * but we defensively log + fail-fast here to surface any misconfig.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[sit-setup] Missing ${name}. SIT tests must run via ` +
        "`pnpm test:sit` which wraps vitest with firebase emulators:exec.",
    );
  }
  return v;
}

console.log("[sit-setup] Emulator env:", {
  FIRESTORE_EMULATOR_HOST: requireEnv("FIRESTORE_EMULATOR_HOST"),
  FIREBASE_AUTH_EMULATOR_HOST: requireEnv("FIREBASE_AUTH_EMULATOR_HOST"),
  GCLOUD_PROJECT: requireEnv("GCLOUD_PROJECT"),
});

/**
 * When Typesense is configured (CI SIT job or local search:up), bootstrap
 * the cards collection once so the afterWrite sync hook in existing card
 * SITs doesn't enqueue junk into searchSyncFailures. Best-effort — a dead
 * Typesense surfaces later via waitForTypesense() in each suite.
 */
export async function bootstrapTypesenseIfConfigured(): Promise<void> {
  if (!process.env.TYPESENSE_HOST || !process.env.TYPESENSE_API_KEY) return;
  const { ensureCardsCollection } = await import("@/lib/search/bootstrap");
  try {
    await ensureCardsCollection();
    console.log("[sit-setup] Typesense cards collection bootstrapped");
  } catch (err) {
    console.warn(
      "[sit-setup] Typesense bootstrap failed — search SITs will self-skip:",
      err instanceof Error ? err.message : err,
    );
  }
}

await bootstrapTypesenseIfConfigured();
