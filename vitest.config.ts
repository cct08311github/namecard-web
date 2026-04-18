import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules",
      ".next",
      "e2e",
      "tests/e2e",
      // Rules tests require Firebase emulator + Java; run separately via `pnpm test:rules`.
      "src/__tests__/firestore.rules.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "e2e/**",
        "**/*.config.{ts,js,mjs}",
        "**/*.d.ts",
        "src/test/**",
        "src/app/layout.tsx",
        // Rules tests excluded from coverage (separate job).
        "src/__tests__/firestore.rules.test.ts",
        // Firebase SDK boundaries require live SDK; unit-test via integration tests.
        "src/lib/firebase/**",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
