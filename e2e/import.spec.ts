/**
 * Import wizard E2E — vCard + CSV + LinkedIn + dedupe.
 *
 * Pre-conditions: same Firebase emulator harness as cards-crud.spec.ts.
 * Every test calls bypass-login and skips when the route returns 404
 * (i.e. E2E_TEST_MODE is not set).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { test, expect, type BrowserContext } from "@playwright/test";

const TEST_UID = "e2e-import";
const TEST_EMAIL = "e2e-import@example.com";

const VCARD_2 = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Alice Import",
  "N:Import;Alice;;;",
  "ORG:ImportCo",
  "TEL;TYPE=cell:+886-901-000-001",
  "EMAIL:alice@importco.example",
  "NOTE:E2E vCard test",
  "END:VCARD",
  "",
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Bob Import",
  "N:Import;Bob;;;",
  "ORG:ImportCo",
  "TEL;TYPE=cell:+886-901-000-002",
  "EMAIL:bob@importco.example",
  "END:VCARD",
].join("\r\n");

const LINKEDIN_CSV = [
  "First Name,Last Name,Email Address,Company,Position,Connected On",
  "Charlie,LinkedIn,charlie@li.example,LinkedCorp,Engineer,15 Jan 2024",
  "Diana,LinkedIn,diana@li.example,LinkedCorp,PM,16 Jan 2024",
  "Eve,LinkedIn,eve@li.example,LinkedCorp,Designer,17 Jan 2024",
].join("\n");

/** Write a temp file and return its path. Caller is responsible for cleanup. */
function writeTempFile(content: string, suffix: string): string {
  const tmp = path.join(os.tmpdir(), `namecard-e2e-${Date.now()}${suffix}`);
  fs.writeFileSync(tmp, content, "utf-8");
  return tmp;
}

async function bypassLogin(context: BrowserContext): Promise<boolean> {
  const res = await context.request.post("/api/test/bypass-login", {
    data: { uid: TEST_UID, email: TEST_EMAIL, displayName: "E2E Importer" },
    failOnStatusCode: false,
  });
  return res.status() !== 404;
}

test.describe("Import wizard (emulator-backed)", () => {
  test("vCard import happy path — 2 cards", async ({ page, context }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    await page.goto("/import");
    await expect(page.locator("h1")).toContainText("匯入名片");

    // vCard tab should be active by default
    const vcardTab = page.getByRole("tab", { name: /vCard/ });
    await expect(vcardTab).toBeVisible();
    await expect(vcardTab).toHaveAttribute("aria-selected", "true");

    // Upload vCard file
    const vcfPath = writeTempFile(VCARD_2, ".vcf");
    try {
      await page.getByLabel("選擇 vCard 檔案").setInputFiles(vcfPath);

      // Preview table shows 2 rows
      await expect(page.getByRole("heading", { name: /預覽/ })).toBeVisible({ timeout: 10_000 });
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(2);

      // Both rows show "新增" chip (no duplicates in fresh workspace)
      const chips = page.locator("tbody .chip, tbody [class*='chipNew'], tbody [class*='chip']");
      // At least check the submit button reflects correct count
      const submitBtn = page.getByRole("button", { name: /匯入 2 張/ });
      await expect(submitBtn).toBeVisible();

      // Submit
      await submitBtn.click();

      // Wait for success state
      await expect(page.getByRole("heading", { name: /匯入完成/ })).toBeVisible({
        timeout: 20_000,
      });

      // Link to /cards is present in result
      const cardsLink = page.getByRole("link", { name: /前往名片冊/ });
      await expect(cardsLink).toBeVisible();

      // Navigate to cards and verify cards created
      await cardsLink.click();
      await expect(page).toHaveURL("/cards", { timeout: 8_000 });
      await expect(page.locator("body")).toContainText("Alice Import");
      await expect(page.locator("body")).toContainText("Bob Import");
    } finally {
      fs.unlinkSync(vcfPath);
    }
  });

  test("LinkedIn CSV auto-detect — mapping dialog pre-filled", async ({ page, context }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    await page.goto("/import");

    // Switch to CSV tab
    await page.getByRole("tab", { name: /^CSV$/ }).click();

    const csvPath = writeTempFile(LINKEDIN_CSV, ".csv");
    try {
      await page.getByLabel("選擇 CSV 檔案").setInputFiles(csvPath);

      // FieldMappingDialog should appear (LinkedIn confidence ≥ 0.7)
      // The dialog will have a confirm button available without changes
      const confirmBtn = page.getByRole("button", { name: /確認匯入/ });
      await expect(confirmBtn).toBeVisible({ timeout: 10_000 });

      // Confirm without changing any mapping
      await confirmBtn.click();

      // Preview should show 3 rows
      await expect(page.getByRole("heading", { name: /預覽/ })).toBeVisible({ timeout: 10_000 });
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(3);

      // Submit all 3
      const submitBtn = page.getByRole("button", { name: /匯入 3 張/ });
      await expect(submitBtn).toBeVisible();
      await submitBtn.click();

      await expect(page.getByRole("heading", { name: /匯入完成/ })).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  test("Duplicate detection + skip — shows dupe chip and respects skip decision", async ({
    page,
    context,
  }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    // Seed 1 card first (use the first vCard only)
    const seedVcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Dupe Seed",
      "N:Seed;Dupe;;;",
      "EMAIL:dupe-seed@example.com",
      "END:VCARD",
    ].join("\r\n");

    const seedPath = writeTempFile(seedVcard, ".vcf");
    try {
      await page.goto("/import");
      await page.getByLabel("選擇 vCard 檔案").setInputFiles(seedPath);
      await expect(page.getByRole("button", { name: /匯入 1 張/ })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("button", { name: /匯入 1 張/ }).click();
      await expect(page.getByRole("heading", { name: /匯入完成/ })).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      fs.unlinkSync(seedPath);
    }

    // Now import a CSV containing the same email → should detect as dupe
    const dupeCSV = [
      "First Name,Last Name,Email Address,Company,Position,Connected On",
      "Dupe,Seed,dupe-seed@example.com,SeedCo,Manager,01 Jan 2024",
    ].join("\n");

    const dupePath = writeTempFile(dupeCSV, ".csv");
    try {
      // Re-login for the fresh navigation (session cookie persists in context)
      await page.goto("/import");
      await page.getByRole("tab", { name: /^CSV$/ }).click();
      await page.getByLabel("選擇 CSV 檔案").setInputFiles(dupePath);

      // Mapping dialog
      const confirmBtn = page.getByRole("button", { name: /確認匯入/ });
      await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
      await confirmBtn.click();

      // Preview: 1 row with duplicate chip
      await expect(page.getByRole("heading", { name: /預覽/ })).toBeVisible({ timeout: 10_000 });
      // The dupe chip text includes "重複"
      await expect(page.locator("body")).toContainText("重複");

      // Action select should default to "跳過" for the dupe; verify button shows 0 or set skip
      // The row is already defaulted to skip when it's a dupe, so submit should show 匯入 0 張
      // or the button should be disabled. Verify the submit is disabled / zero count.
      const submitBtn = page.getByRole("button", { name: /匯入 0 張/ });
      if (await submitBtn.isVisible()) {
        await expect(submitBtn).toBeDisabled();
      } else {
        // If not disabled-zero, explicitly set to skip via the select
        const sel = page.locator("select").first();
        await sel.selectOption("skip");
        const submitAfterSkip = page.getByRole("button", { name: /匯入 0 張/ });
        await expect(submitAfterSkip).toBeDisabled();
      }
    } finally {
      fs.unlinkSync(dupePath);
    }
  });

  test("Legal disclaimer visible on CSV tab", async ({ page, context }) => {
    const ok = await bypassLogin(context);
    if (!ok) test.skip(true, "bypass route disabled in this env");

    await page.goto("/import");

    // Switch to CSV tab
    await page.getByRole("tab", { name: /^CSV$/ }).click();

    await expect(page.locator("body")).toContainText("此功能僅處理你自行 export 的 CSV，不做爬蟲");
  });
});
