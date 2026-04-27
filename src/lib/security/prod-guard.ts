/**
 * Production safety guard for test-only routes and helpers.
 *
 * Import this module at the top of any file that must never run in production
 * with test infrastructure enabled. The assertion fires at module-load time,
 * which means the Next.js process will crash during startup — not silently
 * during a request — if someone accidentally ships E2E_TEST_MODE=1 to prod.
 */

/**
 * Throws immediately if the process is running in production mode while
 * E2E_TEST_MODE is active. Call this at module level in test-only route
 * handlers so the process fails fast on misconfiguration.
 *
 * In non-production environments the function is a no-op; dev/CI can set
 * E2E_TEST_MODE=1 freely.
 */
export function assertNotProductionWithE2EMode(): void {
  if (process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE === "1") {
    throw new Error(
      "[prod-guard] E2E_TEST_MODE=1 must never be set in production. " +
        "Remove this variable from the production environment and restart the server.",
    );
  }
}
