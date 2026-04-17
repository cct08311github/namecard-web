# AGENTS.md — Agent Instructions

> This file tells coding agents (Claude Code, Copilot, Cursor, etc.) how to work on this repo.

## 🎯 Project Context

Personal work namecard management website. Core differentiator: **relationship context** as first-class citizen (not just OCR & storage).

**Users**: 1 primary + 2-5 colleagues via Firebase Auth + email whitelist + Tailscale Tailnet.

## 🏗️ Architecture Invariants

**Do NOT violate without explicit issue + approval:**

1. **Collection path is `workspaces/{wid}/cards/{cardId}`** (NOT `users/{uid}/cards`). Personal use = `wid = uid`. This was chosen day 1 to avoid Phase 6 breaking migration.
2. **`memberUids: string[]`** must be denormalized on every card doc for Firestore Security Rules `array-contains` check.
3. **Firebase Admin SDK** in `src/lib/firebase/server.ts` (Server Components, Server Actions, Route Handlers).
   **Firebase Web SDK** in `src/lib/firebase/client.ts` (Client Components only).
   Never mix — Web SDK in RSC breaks the build.
4. **Session cookies** (`firebase-admin.auth().createSessionCookie`) with `httpOnly, secure, sameSite=strict`. No ID tokens in `localStorage`.
5. **Storage filenames = `crypto.randomUUID()`** + extension. Downloads via 15-min Signed URL. Never long-lived public download tokens.
6. **OCR providers** implement `OcrProvider` interface in `src/lib/ocr/types.ts`. Swappable via `OCR_PROVIDER` env. MiniMax M2.7 is default; GPT-4o is backup.
7. **Search = Typesense** self-hosted via Docker on Mac mini. Never fuse.js (CJK tokenization fails). Firestore → Typesense sync via Cloud Function / Server Action trigger.

## 🎨 Design Non-Negotiables

- **Editorial × 日式極簡**. Reference: _Kinfolk_ magazine, _Are.na_ whitespace.
- Ban these patterns: default shadcn card grids, gradient hero blobs, uniform card shadow, flat layouts, Geist font default (replace with Noto Serif TC + Fraunces + Inter).
- Every surface must answer: "Would this look believable in Kinfolk?"
- Palette: `--color-paper: oklch(97% 0.01 80)`, `--color-ink: oklch(18% 0.005 60)`, accent `--color-accent: oklch(55% 0.18 30)` (朱紅) or `oklch(40% 0.15 250)` (群青).

## 🧪 Testing Requirements

- **TDD mandatory**: tests first (RED) → impl (GREEN) → refactor.
- **Coverage ≥ 80%** enforced in `vitest.config.ts`.
- **E2E for every user flow** once Phase 2 lands (Playwright).
- **Firestore Rules tested** with `@firebase/rules-unit-testing` emulator — cross-user access must be denied.

## 🔐 Security Non-Negotiables

1. `ALLOWED_EMAILS` env whitelist check in middleware. Tailnet ≠ app authorization.
2. Firestore Rules default `allow read, write: if false;` — every path must explicitly allow.
3. `ownerUid` / `memberUids` cannot be mutated post-create (rule check `resource.data.ownerUid == request.resource.data.ownerUid`).
4. Third-party PII (names, emails, phones) sent to OCR providers (MiniMax/OpenAI) requires user-facing disclaimer.
5. Secrets via `.env.local` (gitignored). Never commit `.env`. Firebase service account JSON → `~/.config/namecard/` with `chmod 600`.

## 🔄 Workflow

Every change:

1. Open GitHub Issue with acceptance criteria.
2. Branch: `feat/phase-N-<short-desc>` or `fix/issue-<N>-<desc>`.
3. Write failing test first.
4. Implement.
5. `pnpm test:coverage && pnpm typecheck && pnpm lint && pnpm format && pnpm build`.
6. Commit format: `<type>(<phase>): <desc>` e.g. `feat(phase-2): add google auth middleware`. Types: feat, fix, refactor, test, docs, chore, perf, ci.
7. PR body: `Closes #<issue>`.
8. Wait for CI green + review.

## 🚫 Never Do

- `--no-verify` on commit (bypass hooks).
- `git push --force` on `main`.
- `git reset --hard` without confirmation.
- Hardcode secrets or API keys.
- Skip tests to "land faster".
- Weaken eslint / prettier / tsconfig to silence errors — fix the source.

## 🗣️ Communication

- 繁體中文 for: Git commits, GitHub Issues, PR descriptions, in-product copy, docs inside this repo.
- English for: Code comments, variable names, ESLint messages.

## 📚 Reference Docs

- Next.js 16: read `node_modules/next/dist/docs/` for breaking changes (note: many APIs differ from older Next.js knowledge).
- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Typesense: https://typesense.org/docs/
- MiniMax API: https://platform.minimax.io/docs
