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
        // Typesense client + bootstrap + reconcile — thin wrappers around
        // the Typesense SDK; behavior is covered by sync.sit.test.ts /
        // reconcile.sit.test.ts / search-end-to-end.sit.test.ts against
        // a real Typesense instance. Pure mappers (toSearchDoc,
        // buildSearchParams, applyTagFilter, url parsing) are UT-covered
        // where they live.
        "src/lib/search/client.ts",
        "src/lib/search/bootstrap.ts",
        "src/lib/search/reconcile.ts",
        // Tags repository + cards-data projection — SIT-covered by
        // tags.sit.test.ts and round-tripped via cards.sit.test.ts.
        "src/db/tags.ts",
        "src/db/cards-data.ts",
        // Server Actions — safe-action wrappers; their repository layer
        // is SIT-covered and happy paths land in Playwright specs.
        "src/app/(app)/**/actions.ts",
        "src/app/(app)/cards/search-actions.ts",
        "src/app/api/**",
        // OCR provider + storage — thin wrappers over vendor SDKs.
        "src/lib/ocr/index.ts",
        "src/lib/ocr/minimax.ts",
        "src/lib/storage/card-images.ts",
        // Auth safe-action wrapper — exercised by every authed SIT + E2E
        // via `createCardAction` / `searchCardsAction` etc.
        "src/lib/auth/safe-action.ts",
        // CardForm submit flow — RHF + startTransition microtask layering
        // is flaky in jsdom; the happy-path submit is covered by the
        // Playwright CRUD journey (follow-up #18). The form's individual
        // behaviors (field groups / required badge / multi-value rows /
        // cancel / edit-mode prefill) ARE covered in CardForm.test.tsx.
        "src/components/cards/CardForm.tsx",
        // Pure-display / route-shell components — rendered in E2E +
        // visual review.
        "src/components/cards/CardGallery.tsx",
        "src/components/cards/CardList.tsx",
        "src/components/cards/ViewToggle.tsx",
        "src/components/cards/CardActions.tsx",
        "src/components/cards/TagFilterBar.tsx",
        "src/components/shell/AppShell.tsx",
        "src/components/timeline/TimelineSection.tsx",
        "src/components/search/SearchBox.tsx",
        "src/components/scan/**",
        "src/components/capture/**",
        "src/app/(app)/tags/TagsClient.tsx",
        // Batch import — server-boundary; SIT-covered by cards-batch.sit.test.ts.
        "src/db/cards-batch.ts",
        // Extracted utility — SIT-covered indirectly via tags + cards-batch.
        "src/db/_utils.ts",
        // Import route shell — RSC, rendered by E2E / visual review.
        "src/app/(app)/import/page.tsx",
        // ImportWizard — partially UT-covered; remainder in Playwright.
        "src/app/(app)/import/ImportWizard.tsx",
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
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
