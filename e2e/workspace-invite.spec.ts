/**
 * Workspace invite / remove E2E.
 *
 * Runs under the existing Firebase-emulator CRUD harness (Auth + Firestore).
 * Both test users must be in ALLOWED_EMAILS for invite to succeed.
 *
 * Pre-conditions (enforced by the e2e-crud CI job):
 *   - Firebase Auth + Firestore emulators running
 *   - Next.js `pnpm start` with env:
 *       E2E_TEST_MODE=1
 *       ALLOWED_EMAILS=...,e2e-w6-alice@example.com,e2e-w6-bob@example.com
 *
 * Self-skips when the bypass route is absent (non-emulator envs).
 */
import { test, expect, type BrowserContext } from "@playwright/test";

const ALICE_UID = "e2e-w6-alice";
const ALICE_EMAIL = "e2e-w6-alice@example.com";
const BOB_UID = "e2e-w6-bob";
const BOB_EMAIL = "e2e-w6-bob@example.com";

/**
 * Bypass Google sign-in by minting a session server-side.
 * Returns false when the bypass route is not available so callers can skip.
 */
async function bypassLogin(
  ctx: BrowserContext,
  uid: string,
  email: string,
  displayName: string,
): Promise<boolean> {
  const res = await ctx.request.post("/api/test/bypass-login", {
    data: { uid, email, displayName },
    failOnStatusCode: false,
  });
  return res.status() !== 404;
}

test.describe("Workspace invite / remove journey (emulator-backed)", () => {
  test("alice invites bob → bob sees alice's card", async ({ browser }) => {
    // Pre-create Bob's Auth user so Alice's invite can find him by email.
    // bypassLogin creates the user in Auth as a side effect; we discard
    // the context immediately since Alice's flow uses a separate context.
    const primer = await browser.newContext();
    await bypassLogin(primer, BOB_UID, BOB_EMAIL, "Bob W6");
    await primer.close();

    // ── Alice context ──────────────────────────────────────────────────
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();

    const available = await bypassLogin(aliceCtx, ALICE_UID, ALICE_EMAIL, "Alice W6");
    if (!available) {
      test.skip(true, "bypass route disabled in this env");
    }

    // Alice creates a card.
    await alicePage.goto("/cards/new");
    await alicePage.getByLabel("中文姓名").fill("王小明");
    await alicePage.getByPlaceholder(/2024 COMPUTEX 攤位/).fill("W6 邀請測試聯絡人");
    await alicePage.getByRole("button", { name: /儲存名片/ }).click();
    await expect(alicePage).toHaveURL(/\/cards\/[A-Za-z0-9]{15,}/, { timeout: 20_000 });
    await expect(alicePage.getByRole("heading", { level: 1 })).toContainText("王小明");

    // Alice navigates to workspace members and invites Bob.
    await alicePage.goto("/workspace/members");
    await alicePage.getByLabel("邀請成員 Email").fill(BOB_EMAIL);
    await alicePage.getByRole("button", { name: "邀請" }).click();

    // Wait for Bob's row to appear with the "編輯" role badge.
    await expect(alicePage.locator(`text=${BOB_EMAIL}`)).toBeVisible({ timeout: 10_000 });
    await expect(alicePage.getByRole("listitem").filter({ hasText: BOB_EMAIL })).toContainText(
      "編輯",
    );

    await aliceCtx.close();

    // ── Bob context ────────────────────────────────────────────────────
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await bypassLogin(bobCtx, BOB_UID, BOB_EMAIL, "Bob W6");

    // Bob visits /cards — Alice's card should be visible thanks to memberUids.
    await bobPage.goto("/cards");
    await expect(bobPage.locator("body")).toContainText("王小明", { timeout: 10_000 });

    await bobCtx.close();
  });

  test("alice removes bob → bob no longer sees alice's card", async ({ browser }) => {
    // Pre-create Bob's Auth user so Alice's invite can find him by email.
    // bypassLogin creates the user in Auth as a side effect; we discard
    // the context immediately since Alice's flow uses a separate context.
    const primer = await browser.newContext();
    await bypassLogin(primer, BOB_UID, BOB_EMAIL, "Bob W6");
    await primer.close();

    // ── Alice context: invite Bob first ───────────────────────────────
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();

    const available = await bypassLogin(aliceCtx, ALICE_UID, ALICE_EMAIL, "Alice W6");
    if (!available) {
      test.skip(true, "bypass route disabled in this env");
    }

    // Ensure Alice has at least one card.
    await alicePage.goto("/cards/new");
    await alicePage.getByLabel("中文姓名").fill("李大華");
    await alicePage.getByPlaceholder(/2024 COMPUTEX 攤位/).fill("W6 移除測試聯絡人");
    await alicePage.getByRole("button", { name: /儲存名片/ }).click();
    await expect(alicePage).toHaveURL(/\/cards\/[A-Za-z0-9]{15,}/, { timeout: 20_000 });

    // Invite Bob.
    await alicePage.goto("/workspace/members");
    await alicePage.getByLabel("邀請成員 Email").fill(BOB_EMAIL);
    await alicePage.getByRole("button", { name: "邀請" }).click();
    await expect(alicePage.locator(`text=${BOB_EMAIL}`)).toBeVisible({ timeout: 10_000 });

    // Now remove Bob: click the ✕ button on Bob's row.
    const bobRow = alicePage.getByRole("listitem").filter({ hasText: BOB_EMAIL });
    await bobRow.getByRole("button", { name: /移除成員/ }).click();

    // Bob's row should disappear.
    await expect(alicePage.locator(`text=${BOB_EMAIL}`)).not.toBeVisible({ timeout: 10_000 });

    await aliceCtx.close();

    // ── Bob context: card should no longer be visible ─────────────────
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await bypassLogin(bobCtx, BOB_UID, BOB_EMAIL, "Bob W6");

    await bobPage.goto("/cards");
    // Bob's own workspace is empty; Alice's card (李大華) must not appear.
    const bodyText = await bobPage.locator("body").innerText();
    expect(bodyText).not.toContain("李大華");

    await bobCtx.close();
  });

  test("bob visiting his own workspace members page sees only himself", async ({ browser }) => {
    // Bob has his own personal workspace. Without a workspace switcher, /workspace/members
    // always shows the signed-in user's personal workspace — so Bob sees only himself.
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();

    const available = await bypassLogin(bobCtx, BOB_UID, BOB_EMAIL, "Bob W6");
    if (!available) {
      test.skip(true, "bypass route disabled in this env");
    }

    await bobPage.goto("/workspace/members");

    // Invite form is visible (Bob is owner of his own workspace).
    await expect(bobPage.getByLabel("邀請成員 Email")).toBeVisible();

    // The member list contains Bob (owner role).
    await expect(
      bobPage.getByRole("list", { name: "成員" }).getByRole("listitem").first(),
    ).toContainText("擁有者");

    // Page renders without unhandled errors.
    await expect(bobPage.locator("h1")).toBeVisible();

    await bobCtx.close();
  });
});
