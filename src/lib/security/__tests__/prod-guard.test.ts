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
