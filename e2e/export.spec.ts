/**
 * Export E2E — ExportButton renders and downloads a valid ZIP.
 *
 * Pre-conditions: same Firebase emulator harness as cards-crud.spec.ts.
 * Tests skip when bypass-login returns 404.
 *
 * Note: ExportButton triggers a programmatic anchor click from a base64
 * blob URL. Playwright's `waitForEvent("download")` captures it reliably
 * when download is triggered by anchor.click() on a blob URL.
 */
import * as fs from "node:fs";

import { test, expect, type BrowserContext } from "@playwright/test";

const TEST_UID = "e2e-export";
const TEST_EMAIL = "e2e-export@example.com";

async function bypassLogin(context: BrowserContext): Promise<boolean> {
  const res = await context.request.post("/api/test/bypass-login", {
    data: { uid: TEST_UID, email: TEST_EMAIL, displayName: "E2E Exporter" },
    failOnStatusCode: false,
  });
  return res.status() !== 404;
}

test.describe("Export (emulator-backed)", () => {
  test("Export button appears when cards exist", async ({ page, context }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    // Create a card via the UI so there is at least one card
    await page.goto("/cards/new");
    await page.getByLabel("中文姓名").fill("匯出測試甲");
    await page.getByLabel("英文姓名").fill("Export Alpha");
    await page.getByLabel("公司 (中)").fill("匯出公司");
    await page.getByPlaceholder(/2024 COMPUTEX 攤位/).fill("E2E export test card");
    await page.getByRole("button", { name: /儲存名片/ }).click();
    await expect(page).toHaveURL(/\/cards\/[A-Za-z0-9]{15,}(\?|$)/, { timeout: 20_000 });

    // Navigate to /cards and verify ExportButton is present
    await page.goto("/cards");
    const exportBtn = page.getByRole("button", { name: /匯出/ });
    await expect(exportBtn).toBeVisible();
  });

  test("Export all downloads a valid ZIP", async ({ page, context }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    // Ensure at least one card exists
    await page.goto("/cards/new");
    await page.getByLabel("中文姓名").fill("匯出測試乙");
    await page.getByLabel("英文姓名").fill("Export Beta");
    await page.getByLabel("公司 (中)").fill("匯出公司");
    await page.getByPlaceholder(/2024 COMPUTEX 攤位/).fill("E2E export zip test");
    await page.getByRole("button", { name: /儲存名片/ }).click();
    await expect(page).toHaveURL(/\/cards\/[A-Za-z0-9]{15,}(\?|$)/, { timeout: 20_000 });

    await page.goto("/cards");
    const exportBtn = page.getByRole("button", { name: /^匯出$/ });
    await expect(exportBtn).toBeVisible();

    // ExportButton builds a blob URL and triggers anchor.click() — capture as download.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      exportBtn.click(),
    ]);

    // Filename matches namecard-export-YYYY-MM-DD.zip
    expect(download.suggestedFilename()).toMatch(/^namecard-export-\d{4}-\d{2}-\d{2}\.zip$/);

    // Verify the downloaded file is non-empty and starts with ZIP magic bytes (PK\x03\x04)
    const dlPath = await download.path();
    if (dlPath) {
      const buf = fs.readFileSync(dlPath);
      expect(buf.length).toBeGreaterThan(0);
      // ZIP magic: 0x50 0x4b (PK)
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    }
    // If dlPath is null (some environments), at least verify suggestedFilename passed
  });

  // 500-card cap is covered by P5D unit tests — not tested here (would need 501 fixture cards).
});
