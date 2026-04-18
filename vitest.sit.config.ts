import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * SIT (System Integration Tests) config.
 *
 * Tests marked `*.sit.test.ts` talk to the real Firebase emulator suite via
 * firebase-admin. Invoked by `pnpm test:sit`, which wraps them with
 * `firebase emulators:exec` so env vars (FIRESTORE_EMULATOR_HOST,
 * FIREBASE_AUTH_EMULATOR_HOST, GCLOUD_PROJECT) are populated.
 *
 * Single worker + non-concurrent so emulator state doesn't race between tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.sit.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
