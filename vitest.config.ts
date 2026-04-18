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
      // SIT tests run via `pnpm test:sit` with real Firebase emulators and
      // server-only imports — keep them out of the default UT pipeline.
      "src/**/*.sit.test.ts",
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
        // Route containers — visually verified by E2E (Phase 8 follow-up).
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/app/(auth)/login/LoginForm.tsx",
        // Rules + SIT tests measured separately — not part of UT coverage.
        "src/__tests__/firestore.rules.test.ts",
        "src/**/*.sit.test.ts",
        // Firebase SDK boundary — structural; behavior is covered by SIT
        // (db/cards / lib/workspace/ensure / lib/firebase/session) in
        // `pnpm test:sit`. See AGENTS.md §Testing Requirements.
        "src/lib/firebase/**",
        // CardForm submit flow — RHF + startTransition microtask layering
        // is flaky in jsdom; the happy-path submit is covered by the
        // Playwright CRUD journey (follow-up #18). The form's individual
        // behaviors (field groups / required badge / multi-value rows /
        // cancel / edit-mode prefill) ARE covered in CardForm.test.tsx.
        "src/components/cards/CardForm.tsx",
        // Pure-display components — rendered in E2E + visual review.
        "src/components/cards/CardGallery.tsx",
        "src/components/cards/CardList.tsx",
        "src/components/cards/ViewToggle.tsx",
        "src/components/cards/CardActions.tsx",
        "src/components/shell/AppShell.tsx",
        "src/components/timeline/TimelineSection.tsx",
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
