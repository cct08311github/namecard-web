import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * SIT config — tests marked `*.sit.test.ts` hit real Firebase emulators via
 * firebase-admin. Wrapped by `pnpm test:sit` (firebase emulators:exec).
 *
 * `server-only` is aliased to a no-op stub so SIT can import production
 * modules that use `import "server-only"` as a bundler guard (Next.js-only).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.sit.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    setupFiles: ["./src/test/sit-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: "forks",
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
