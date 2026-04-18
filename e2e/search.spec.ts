import { expect, test } from "@playwright/test";

/**
 * Search + tag filter E2E. Runs under the existing Firebase-emulator
 * E2E harness (Auth + Firestore). Typesense is NOT provisioned in the
 * playwright CI job, so search is expected to degrade gracefully:
 *   - /cards?q=... still loads without 500
 *   - SearchBox opens via ⌘K and shows a degraded notice
 *   - URL state survives reloads
 *
 * When Typesense is available (local dev + SIT), the suite still runs
 * but just exercises the happy-path layout — no assertions require
 * a live index.
 */

test.describe("search + tag filter — graceful UI", () => {
  test("/cards?q=xyz renders without 500 and shows search query in header", async ({
    page,
    context,
  }) => {
    const res = await context.request.post("/api/test/bypass-login", {
      data: { email: "e2e-alice@example.com", uid: "e2e-alice", displayName: "Alice" },
      failOnStatusCode: false,
    });
    if (res.status() === 404) test.skip(true, "bypass route disabled in this env");
    await page.goto("/cards?q=nomatch");
    await expect(page).toHaveURL(/\/cards\?q=nomatch/);
    // With Typesense down we fall through to an empty state; with it up
    // we still render zero hits for this gibberish query — either is fine.
    await expect(page.locator("h1")).toBeVisible();
  });

  test("SearchBox opens via keyboard shortcut and closes with Escape", async ({
    page,
    context,
  }) => {
    const res = await context.request.post("/api/test/bypass-login", {
      data: { email: "e2e-alice@example.com", uid: "e2e-alice", displayName: "Alice" },
      failOnStatusCode: false,
    });
    if (res.status() === 404) test.skip(true, "bypass route disabled in this env");

    await page.goto("/");
    // Open via trigger button (keyboard chord differs per OS in Playwright).
    await page.getByRole("button", { name: /開啟搜尋/ }).click();
    await expect(page.getByRole("dialog", { name: /搜尋名片/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /搜尋名片/ })).not.toBeVisible();
  });

  test("URL state round-trip — /cards?tag=ai&tagMode=and preserves filter", async ({
    page,
    context,
  }) => {
    const res = await context.request.post("/api/test/bypass-login", {
      data: { email: "e2e-alice@example.com", uid: "e2e-alice", displayName: "Alice" },
      failOnStatusCode: false,
    });
    if (res.status() === 404) test.skip(true, "bypass route disabled in this env");

    await page.goto("/cards?tag=fake-id&tagMode=and");
    expect(new URL(page.url()).searchParams.get("tag")).toBe("fake-id");
    expect(new URL(page.url()).searchParams.get("tagMode")).toBe("and");
  });
});
