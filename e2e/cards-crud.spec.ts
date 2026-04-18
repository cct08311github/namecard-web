/**
 * End-to-end CRUD journey with Firebase Auth emulator bypass.
 *
 * Pre-conditions (enforced by the e2e-crud CI job):
 *   - Firebase Auth + Firestore emulators running
 *   - Next.js `pnpm start` with env:
 *       E2E_TEST_MODE=1
 *       FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *       FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *       ALLOWED_EMAILS=e2e-alice@example.com
 *       FIREBASE_ADMIN_PROJECT_ID=demo-namecard-sit
 *
 * This spec runs against `pnpm start` (production build) to exercise the same
 * bundle shipped to users. Playwright config's `webServer` handles boot.
 */
import { test, expect } from "@playwright/test";

const TEST_UID = "e2e-alice";
const TEST_EMAIL = "e2e-alice@example.com";

test.describe("Cards CRUD journey (emulator-backed)", () => {
  test.beforeEach(async ({ context }) => {
    // Skip the Google popup — mint a real session cookie server-side.
    // Using context.request so Set-Cookie populates the browser context
    // (the top-level `request` fixture uses a separate cookie jar).
    const res = await context.request.post("/api/test/bypass-login", {
      data: {
        uid: TEST_UID,
        email: TEST_EMAIL,
        displayName: "Alice",
      },
    });
    expect(res.ok(), `bypass-login failed: ${await res.text()}`).toBe(true);

    // Verify session cookie is present.
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "__nc_session")).toBeDefined();
  });

  test("create → timeline → detail → edit → touch → vCard → delete", async ({ page, context }) => {
    const pageErrors: string[] = [];
    const requestLog: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`);
    });
    page.on("request", (req) => {
      if (req.method() === "POST") requestLog.push(`POST ${req.url()}`);
    });
    page.on("response", (res) => {
      if (res.request().method() === "POST") {
        requestLog.push(`  ← ${res.status()} ${res.url()}`);
      }
    });

    // ────────────────────────────────────────────────────────────────
    // 1. Home loads after login (no redirect)
    // ────────────────────────────────────────────────────────────────
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toContainText(/今天/);

    // ────────────────────────────────────────────────────────────────
    // 2. Empty state — click "建立第一張名片" (or /cards/new)
    // ────────────────────────────────────────────────────────────────
    await page.goto("/cards/new");
    await expect(page.locator("h1")).toContainText(/值得記得/);

    // ────────────────────────────────────────────────────────────────
    // 3. Fill the form + submit
    // ────────────────────────────────────────────────────────────────
    await page.getByLabel("中文姓名").fill("陳志明");
    await page.getByLabel("英文姓名").fill("Ming Chen");
    await page.getByLabel("公司 (中)").fill("某某科技");
    await page.getByLabel("職稱 (中)").fill("產品經理");

    // Add a phone row.
    await page.getByRole("button", { name: /新增電話/ }).click();
    await page.getByPlaceholder("+886-912-345-678").fill("+886-912-345-678");

    // whyRemember textarea — locate by placeholder (stable).
    await page.getByPlaceholder(/2024 COMPUTEX 攤位/).fill("2024 COMPUTEX 邊緣 AI 一起布展 3 小時");

    const submit = page.getByRole("button", { name: /儲存名片/ });
    await submit.click();

    // Server Action + Firestore emulator write may take more than 5s on CI.
    // Bump timeout + dump diagnostics on failure so we can see WHY submit
    // didn't redirect (JS error, Zod rejection, serverError banner, etc).
    try {
      await expect(page).toHaveURL(/\/cards\/[A-Za-z0-9]{15,}(\?suggest=1)?$/, { timeout: 20_000 });
    } catch (err) {
      console.log("URL did not change. Current:", page.url());
      console.log("Captured errors:", pageErrors);
      console.log("POST requests:", requestLog);
      // Check visible validation error messages:
      const errorText = await page.locator("[role='alert']").allTextContents();
      console.log("Alert text:", errorText);
      // Submit button state
      const submitDisabled = await submit.isDisabled();
      console.log("Submit disabled?", submitDisabled);
      console.log("Body (first 1500):", (await page.locator("body").innerText()).slice(0, 1500));
      throw err;
    }
    await expect(page.getByRole("heading", { level: 1 })).toContainText("陳志明");

    // Capture card id from URL for later steps.
    const cardIdMatch = page.url().match(/\/cards\/([A-Za-z0-9]{15,})(\?|$)/);
    expect(cardIdMatch).toBeTruthy();
    const cardId = cardIdMatch![1];

    // ────────────────────────────────────────────────────────────────
    // 4. Detail page shows whyRemember pull-quote
    // ────────────────────────────────────────────────────────────────
    await expect(page.getByText("2024 COMPUTEX 邊緣 AI 一起布展 3 小時")).toBeVisible();

    // ────────────────────────────────────────────────────────────────
    // 5. Timeline home shows the card in "新建立"
    // ────────────────────────────────────────────────────────────────
    await page.goto("/");
    await expect(page.getByText("新建立")).toBeVisible();
    // The card's name should appear at least once somewhere on the timeline.
    await expect(page.locator("body")).toContainText("陳志明");

    // ────────────────────────────────────────────────────────────────
    // 6. Cards list shows the card in gallery
    // ────────────────────────────────────────────────────────────────
    await page.goto("/cards");
    await expect(page.locator("body")).toContainText("陳志明");
    // Count should be >= 1 in header
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/\d+ 張名片/);

    // ────────────────────────────────────────────────────────────────
    // 7. Edit flow
    // ────────────────────────────────────────────────────────────────
    await page.goto(`/cards/${cardId}/edit`);
    const whyField = page.getByPlaceholder(/2024 COMPUTEX 攤位/);
    await whyField.fill("後續合作 AI 邊緣推論，穩定聯絡");
    await page.getByRole("button", { name: /更新名片/ }).click();
    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}`));
    await expect(page.getByText("後續合作 AI 邊緣推論，穩定聯絡")).toBeVisible();

    // ────────────────────────────────────────────────────────────────
    // 8. Touch "剛剛聯絡過"
    // ────────────────────────────────────────────────────────────────
    await page.goto(`/cards/${cardId}`);
    await page.getByRole("button", { name: /剛剛聯絡過/ }).click();
    // Wait for the action to complete (router.refresh).
    await page.waitForTimeout(500);

    // ────────────────────────────────────────────────────────────────
    // 9. vCard download — fetch directly (avoids download-event flakiness)
    // ────────────────────────────────────────────────────────────────
    const vcardRes = await context.request.get(`/api/cards/${cardId}/vcard`);
    expect(vcardRes.status()).toBe(200);
    expect(vcardRes.headers()["content-type"]).toContain("text/vcard");
    const vcardBody = await vcardRes.text();
    expect(vcardBody).toMatch(/^BEGIN:VCARD\r\nVERSION:4\.0/);
    expect(vcardBody).toContain("FN:陳志明");
    expect(vcardBody).toContain("【為什麼記得】後續合作 AI 邊緣推論");
    expect(vcardBody).toContain("TEL;TYPE=cell:+886-912-345-678");

    // ────────────────────────────────────────────────────────────────
    // 10. Delete (armed confirmation)
    // ────────────────────────────────────────────────────────────────
    const deleteBtn = page.getByRole("button", { name: /刪除名片/ });
    await deleteBtn.click(); // first click arms
    await expect(page.getByRole("button", { name: /確定要刪除嗎？/ })).toBeVisible();
    await page.getByRole("button", { name: /確定要刪除嗎？/ }).click();

    // Redirects to /cards; card should no longer appear.
    await expect(page).toHaveURL("/cards", { timeout: 8000 });
    const bodyAfter = await page.locator("body").innerText();
    expect(bodyAfter).not.toContain("陳志明");

    // Detail page now 404s (card soft-deleted).
    const detail404 = await context.request.get(`/cards/${cardId}`);
    expect([404, 410]).toContain(detail404.status());

    // vCard also gone (410 or 404).
    const vcard404 = await context.request.get(`/api/cards/${cardId}/vcard`);
    expect([404, 410]).toContain(vcard404.status());
  });

  test("rejects create when whyRemember is empty (client-side zod)", async ({ page }) => {
    await page.goto("/cards/new");
    await page.getByLabel("中文姓名").fill("試試看");
    // Intentionally don't fill whyRemember.
    await page.getByRole("button", { name: /儲存名片/ }).click();

    // Still on the new-card page, no server action fired.
    await expect(page).toHaveURL("/cards/new");
  });
});
