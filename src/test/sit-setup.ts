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
