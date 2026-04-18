/**
 * SIT for src/lib/firebase/session.ts against the live Auth emulator.
 *
 * Exercises the real createSessionCookie round-trip (mint custom token →
 * exchange for ID token → createSession → verifySessionCookie → readSession).
 *
 * TDD order: assertions written BEFORE validating the implementation. Any
 * mismatch between expected session semantics and impl behavior is a bug.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/shared";
import {
  EMULATOR_PROJECT_ID,
  disposeSitApp,
  isEmulatorReady,
  resetEmulators,
  seedEmulatorUser,
} from "@/test/firebase-emulator";
import { TEST_EMAIL_ALICE, TEST_EMAIL_BOB, TEST_UID_ALICE, TEST_UID_BOB } from "@/test/fixtures";

const describeIfEmulator = isEmulatorReady() ? describe : describe.skip;

/**
 * In-memory cookie store that mimics Next.js's ReadonlyRequestCookies enough
 * for session.ts — exposes get/set/delete.
 */
class FakeCookieStore {
  private jar = new Map<string, { value: string }>();

  get(name: string): { name: string; value: string } | undefined {
    const entry = this.jar.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }
  set(name: string, value: string, _options?: unknown): void {
    this.jar.set(name, { value });
  }
  delete(name: string): void {
    this.jar.delete(name);
  }
  _size(): number {
    return this.jar.size;
  }
}

let currentStore: FakeCookieStore;

// next/headers.cookies() — must return the store we assigned in each test.
vi.mock("next/headers", () => ({
  cookies: async () => currentStore,
}));

describeIfEmulator("session (SIT)", () => {
  let session: typeof import("../session");

  beforeAll(async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    session = await import("../session");
  });

  beforeEach(async () => {
    currentStore = new FakeCookieStore();
    await resetEmulators();
    process.env.ALLOWED_EMAILS = TEST_EMAIL_ALICE;
  });

  afterEach(() => {
    delete process.env.ALLOWED_EMAILS;
  });

  afterAll(async () => {
    await disposeSitApp();
  });

  describe("createSession", () => {
    it("writes the session cookie and returns user metadata on allowlisted email", async () => {
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
        displayName: "Alice",
      });

      const user = await session.createSession(idToken);

      expect(user.uid).toBe(TEST_UID_ALICE);
      expect(user.email).toBe(TEST_EMAIL_ALICE);
      expect(user.displayName).toBe("Alice");
      expect(currentStore.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
    });

    it("rejects a user whose email is NOT in ALLOWED_EMAILS", async () => {
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_BOB,
        email: TEST_EMAIL_BOB,
      });

      await expect(session.createSession(idToken)).rejects.toThrow(
        /not in ALLOWED_EMAILS whitelist/,
      );
      expect(currentStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
    });

    it("matches ALLOWED_EMAILS case-insensitively and with whitespace around entries", async () => {
      process.env.ALLOWED_EMAILS = `  ${TEST_EMAIL_ALICE.toUpperCase()} , other@example.com`;
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
      });

      const user = await session.createSession(idToken);
      expect(user.email).toBe(TEST_EMAIL_ALICE);
    });

    it("throws when the ID token is invalid/expired/malformed", async () => {
      await expect(session.createSession("not-a-valid-token")).rejects.toThrow();
      expect(currentStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
    });

    it("allows multiple whitelisted emails (comma-separated)", async () => {
      process.env.ALLOWED_EMAILS = `${TEST_EMAIL_ALICE},${TEST_EMAIL_BOB}`;
      const idTokenAlice = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
      });
      const idTokenBob = await seedEmulatorUser({
        uid: TEST_UID_BOB,
        email: TEST_EMAIL_BOB,
      });

      const alice = await session.createSession(idTokenAlice);
      // Starting a new session overwrites the cookie; that's OK, each user
      // lives in their own browser.
      const bob = await session.createSession(idTokenBob);

      expect(alice.email).toBe(TEST_EMAIL_ALICE);
      expect(bob.email).toBe(TEST_EMAIL_BOB);
    });
  });

  describe("readSession", () => {
    it("returns null when no cookie is set", async () => {
      expect(await session.readSession()).toBeNull();
    });

    it("returns the user when the cookie was set by createSession", async () => {
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
        displayName: "Alice",
      });
      await session.createSession(idToken);

      const me = await session.readSession();
      expect(me?.uid).toBe(TEST_UID_ALICE);
      expect(me?.email).toBe(TEST_EMAIL_ALICE);
      expect(me?.displayName).toBe("Alice");
    });

    it("returns null when cookie is a non-session string", async () => {
      currentStore.set(SESSION_COOKIE_NAME, "garbage-not-a-jwt");
      expect(await session.readSession()).toBeNull();
    });

    it("returns null when ALLOWED_EMAILS was narrowed after cookie was minted", async () => {
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
      });
      await session.createSession(idToken);
      // Admin revokes access.
      process.env.ALLOWED_EMAILS = "someone-else@example.com";

      expect(await session.readSession()).toBeNull();
    });
  });

  describe("destroySession", () => {
    it("removes the session cookie", async () => {
      const idToken = await seedEmulatorUser({
        uid: TEST_UID_ALICE,
        email: TEST_EMAIL_ALICE,
      });
      await session.createSession(idToken);
      expect(currentStore.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();

      await session.destroySession();
      expect(currentStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
    });

    it("is safe to call when no cookie exists", async () => {
      await expect(session.destroySession()).resolves.toBeUndefined();
    });
  });
});
