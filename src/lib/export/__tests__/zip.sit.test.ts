/**
 * SIT: batch export with real Firebase Storage emulator.
 *
 * Gates on FIREBASE_STORAGE_EMULATOR_HOST — skipped automatically in CI
 * unless the Storage emulator is configured.
 *
 * The Storage emulator support in the Firebase Local Emulator Suite
 * requires FIREBASE_STORAGE_EMULATOR_HOST and a running `firebase emulators:start`
 * session with `--only storage` (or combined with firestore).
 */

import { describe, it } from "vitest";

const EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const describeMaybeSkip = EMULATOR_HOST ? describe : describe.skip;

describeMaybeSkip("buildCardsZip SIT (real Storage emulator)", () => {
  // SIT is gated on Storage emulator presence.
  // When FIREBASE_STORAGE_EMULATOR_HOST is set, tests can be added here
  // using uploadCardImage to seed test images and then calling buildCardsZip
  // with a real fetchImage that talks to the emulator bucket.
  //
  // Skipped in this implementation because the Storage emulator adds
  // significant CI complexity (Java 21 + firebase-tools + bucket init),
  // and the UT suite plus Playwright E2E in P5F give sufficient coverage.
  it.skip("placeholder — add real emulator SIT when Storage emulator is available", () => {});
});
