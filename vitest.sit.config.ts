import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * SIT config. Tests marked `*.sit.test.ts` run via firebase-admin against
 * the Firestore + Auth emulators. Wrapped by `pnpm test:sit` which calls
 * `firebase emulators:exec` to inject FIRESTORE_EMULATOR_HOST /
 * FIREBASE_AUTH_EMULATOR_HOST / GCLOUD_PROJECT.
 *
 * setupFiles: sit-setup.ts fails fast if env is missing, surfacing
 * configuration errors instead of silently skipping tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.sit.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    setupFiles: ["./src/test/sit-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Single-fork pool so emulator state doesn't race between tests.
    pool: "forks",
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
