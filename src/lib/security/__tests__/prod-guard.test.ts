import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertNotProductionWithE2EMode } from "../prod-guard";

describe("assertNotProductionWithE2EMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when NODE_ENV=production and E2E_TEST_MODE=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_MODE", "1");
    expect(() => assertNotProductionWithE2EMode()).toThrow(
      /E2E_TEST_MODE=1 must never be set in production/,
    );
  });

  it("does NOT throw in production without E2E_TEST_MODE", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_MODE", "");
    expect(() => assertNotProductionWithE2EMode()).not.toThrow();
  });

  it("does NOT throw in development with E2E_TEST_MODE=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_MODE", "1");
    expect(() => assertNotProductionWithE2EMode()).not.toThrow();
  });

  it("does NOT throw in test mode with E2E_TEST_MODE=1", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_TEST_MODE", "1");
    expect(() => assertNotProductionWithE2EMode()).not.toThrow();
  });

  it("does NOT throw when E2E_TEST_MODE is unset", () => {
    vi.stubEnv("E2E_TEST_MODE", "");
    expect(() => assertNotProductionWithE2EMode()).not.toThrow();
  });

  describe("Firebase Auth Emulator bypass", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("does NOT throw when production + E2E_TEST_MODE=1 + FIREBASE_AUTH_EMULATOR_HOST set (CI E2E path)", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_TEST_MODE", "1");
      vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099");
      expect(() => assertNotProductionWithE2EMode()).not.toThrow();
    });

    it("STILL throws when production + E2E_TEST_MODE=1 + FIREBASE_AUTH_EMULATOR_HOST NOT set (real prod safety)", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_TEST_MODE", "1");
      vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
      expect(() => assertNotProductionWithE2EMode()).toThrow(
        /E2E_TEST_MODE=1 must never be set in production/,
      );
    });
  });

  describe("boundary: non-'1' values of E2E_TEST_MODE in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("does NOT throw when E2E_TEST_MODE=0", () => {
      vi.stubEnv("E2E_TEST_MODE", "0");
      expect(() => assertNotProductionWithE2EMode()).not.toThrow();
    });

    it("does NOT throw when E2E_TEST_MODE=true (string)", () => {
      vi.stubEnv("E2E_TEST_MODE", "true");
      expect(() => assertNotProductionWithE2EMode()).not.toThrow();
    });
  });
});
