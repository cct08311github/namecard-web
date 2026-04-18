# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Read this with [AGENTS.md](./AGENTS.md)** — AGENTS.md owns architecture invariants and non-negotiables; this file owns "how to work productively" (commands, big-picture flow).

## Commands

### Dev loop

```bash
pnpm dev                   # Next.js dev server on :3000 (Turbopack)
pnpm build                 # Production build
pnpm start                 # Production server (after build)
```

### Verification gates

Run these locally before opening a PR. CI runs all three (`check` / `rules` / `e2e` jobs).

```bash
pnpm typecheck             # tsc --noEmit
pnpm lint                  # ESLint 9 flat config
pnpm format                # Prettier --check (auto-fix: pnpm format:fix)
pnpm test                  # Vitest UT (pure fns + React components via jsdom)
pnpm test:coverage         # 80% UT threshold — branches/lines/funcs/stmts
pnpm test:sit              # SIT via firebase emulators:exec (needs Java 21)
pnpm test:rules            # Firestore rules integration (needs Java 21)
pnpm test:e2e              # Playwright (chromium + mobile-safari)
```

### Test layering (UT / SIT / Rules / E2E)

- **UT** — `*.test.ts[x]`: pure functions + React components via jsdom. No Firebase, no network.
- **SIT** — `*.sit.test.ts`: real `firebase-admin` against Firestore + Auth emulators. Covers `db/cards.ts`, `lib/firebase/session.ts`, `lib/workspace/ensure.ts`, `(app)/cards/actions.ts`. See `src/test/firebase-emulator.ts`.
- **Rules integration** — `src/__tests__/firestore.rules.test.ts`: cross-user access denial via `@firebase/rules-unit-testing`.
- **E2E** — `e2e/*.spec.ts`: full browser via Playwright.

Server-boundary code (`lib/firebase/**`) is excluded from UT coverage because it's covered by SIT — not an exclusion to dodge the bar.

### Running a single test

```bash
pnpm test src/lib/timeline/__tests__/categorize.test.ts
pnpm test -t "uses nameZh as FN"                    # by test-name substring
pnpm exec playwright test e2e/auth-gate.spec.ts
```

### Firebase deployment

Rules and indexes live in-repo (`firestore.rules`, `storage.rules`, `firestore.indexes.json`). Deploy with:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only storage
```

Target project is pinned to `namecard-web-prd` via `.firebaserc`. Firebase Storage must be enabled in the Console once (one-time manual step) before `storage` deploys work.

## Big-picture architecture

### Tech stack

- **Next.js 16** App Router with React Server Components (note: many APIs differ from Next 13/14 training data; when in doubt, check `node_modules/next/dist/docs/`).
- **Firebase** — Auth (Google provider) + Firestore + Storage, all pointed at the single `namecard-web-prd` project.
- **Typesense** — Phase 4+ search (Docker Compose in `docker-compose.dev.yml`, not required for MVP).
- **next-safe-action + Zod** — typed Server Actions with server-side error handling.
- **React Hook Form + useFieldArray** — multi-value form fields (phones/emails).
- **CSS Modules + design tokens** (`src/styles/tokens.css`) — no hardcoded palette, Fraunces + Noto Serif TC + Inter via `next/font`.

### The dual-SDK boundary (most critical convention)

Firebase has two SDKs — Web (browser) and Admin (server). The repo **strictly separates** them, and the boundary is enforced by `import "server-only"` at the top of server files:

| File                          | Purpose                                                                       | Used from                                         |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/lib/firebase/shared.ts`  | Constants, path helpers, public config reader                                 | both                                              |
| `src/lib/firebase/server.ts`  | Admin SDK — Firestore/Auth/Storage                                            | Server Components, Server Actions, Route Handlers |
| `src/lib/firebase/client.ts`  | Web SDK — `signInWithPopup` + `GoogleAuthProvider`                            | Client Components only (has `"use client"`)       |
| `src/lib/firebase/session.ts` | `createSession` / `readSession` / `destroySession` cookie helpers (Admin SDK) | server-only                                       |

Importing `firebase/*` inside an RSC or `firebase-admin/*` inside a client component will break the build. Fix type: move the logic to the correct side of the boundary, don't try to work around it.

### The auth flow (understanding requires 4+ files)

1. `src/middleware.ts` — inspects request cookie; if `__nc_session` missing and path is private, redirects to `/login?next=<path>`.
2. `src/app/(auth)/login/page.tsx` — Server Component; if already signed in, redirects to `/`. Otherwise renders `LoginForm`.
3. `src/app/(auth)/login/LoginForm.tsx` — Client Component calls `signInWithPopup(getClientAuth(), googleAuthProvider())`, then `getIdToken(true)`, then invokes the server action.
4. `src/app/(auth)/login/actions.ts#signInWithIdTokenAction` — verifies ID token via Admin SDK, checks email against `ALLOWED_EMAILS` env, calls `createSessionCookie`, calls `ensurePersonalWorkspace`.
5. `src/app/(app)/layout.tsx` — every request into the `(app)` group re-calls `readSession()`; if null, redirect to `/login`; otherwise ensures the personal workspace exists (idempotent) and renders `AppShell`.

**Two-layer authorization**: Tailscale tailnet membership is separate from application whitelist. The app only trusts `ALLOWED_EMAILS`; Tailnet presence never grants app access.

### The collection-path invariant

All card/tag documents live under `workspaces/{wid}/cards/{cardId}` and `workspaces/{wid}/tags/{tagId}` — even for personal single-user use, where `wid === uid`. This was chosen on day 1 to avoid a breaking migration when the workspace-invite UI lands in Phase 6.

Every card doc carries a **denormalized** `memberUids: string[]` so Firestore Security Rules can do a one-read `request.auth.uid in resource.data.memberUids` check instead of a cross-doc `get()`. Rules tests in `src/__tests__/firestore.rules.test.ts` lock this down with 14 emulator-backed cases.

### The timeline home is the product differentiator

`src/lib/timeline/categorize.ts` is a pure function that splits cards into three fixed-order sections:

- `newly-added` — `createdAt` within last 7 days (default)
- `met-this-month` — `firstMetDate` in the current calendar month
- `uncontacted` — `lastContactedAt` older than 30 days, or null + `createdAt` older than 30 days

A card never appears in more than one section (priority: met > newly > uncontacted). 17 unit tests lock ordering and rules. Changing these thresholds is a product decision — don't do it silently during refactors.

### Zod + React Hook Form gotcha

Several schema fields use `.default([])` (phones, emails, tagIds, etc.). `z.infer<typeof cardCreateSchema>` returns the **output** type (arrays required). React Hook Form's internal typing wants the **input** type (arrays optional). The resolver cast in `src/components/cards/CardForm.tsx` uses `z.input<typeof schema>` for form values and casts back to `CardCreateInput` at submit time. When adding new schema fields, follow this pattern.

### CI layout

`.github/workflows/ci.yml` runs three parallel jobs on each PR:

1. **Build / Lint / Test** — typecheck + lint + format-check + `test:coverage` (80% gate) + `next build`.
2. **Firestore Rules Integration** — sets up Temurin JDK 21 + runs `firebase emulators:exec --only firestore "vitest run <rules-test>"`. The rules test file is **not** excluded from Vitest's default include; it self-skips via `describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`.
3. **Playwright E2E** — installs chromium + webkit, runs `e2e/*.spec.ts`. Requires the `PLAYWRIGHT_BASE_URL` or the default web server in `playwright.config.ts`.

The branch-coverage threshold is the usual failure point when adding new switch/default arms — run `pnpm test:coverage` locally before pushing.

### Writing to protected config files

Several repo-level files are intentionally hard to weaken:

- `.prettierrc.json` — a `PreToolUse:Write` hook blocks direct creation; prettier config lives inline under `package.json#prettier`.
- `eslint.config.mjs` — blocked by the config-protection hook when using `Edit`. Use a Bash heredoc for additive changes (adding ignored globs for generated outputs is legitimate; weakening rules is not).
- `.github/workflows/*.yml` — a security-reminder hook watches for `${{ github.event.* }}` usage in `run:` steps. Always pass untrusted inputs through `env:`.

## Patterns you will rediscover

- **File layout follows route structure**: server logic for `/cards` lives under `src/app/(app)/cards/` as `actions.ts` / `page.tsx` / `[id]/page.tsx` — not in a separate `server/` folder. Repository code is in `src/db/`, shared libs in `src/lib/`.
- **Dates as ISO strings on the wire**: `firstMetDate` is a `YYYY-MM-DD` string (not a Timestamp) because it's a user-meaningful date, not an event time. Firestore timestamps are reserved for `createdAt` / `updatedAt` / `lastContactedAt` / `deletedAt`.
- **Soft delete everywhere**: `deletedAt: serverTimestamp()` never a hard delete. All read paths filter `deletedAt === null`.
- **Server Actions return shape**: `next-safe-action` returns `{ data?, serverError?, validationErrors? }`. Always branch on all three in client components; a silent `undefined` return is the no-op path.
- **Design tokens are the source of truth** (`src/styles/tokens.css`). Never hardcode colors, spacing, or font sizes in component CSS — pull from `var(--token-name)`.
