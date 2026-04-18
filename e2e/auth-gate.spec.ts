import { expect, test } from "@playwright/test";

test.describe("auth gate", () => {
  test("unauthenticated visit to / redirects to /login", async ({ page }) => {
    const response = await page.goto("/");
    // Playwright follows redirects; we detect the final URL.
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.locator("h1")).toContainText("登入你的");
    // Landed HTML must be 200 after redirect.
    expect(response?.status()).toBe(200);
  });

  test("unauthenticated visit to /cards redirects to /login with ?next=", async ({ page }) => {
    await page.goto("/cards");
    await expect(page).toHaveURL(/\/login\?next=%2Fcards/);
  });

  test("login page shows Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    const button = page.getByRole("button", { name: /Google 帳號登入/ });
    await expect(button).toBeVisible();
  });

  test("unauthorized page informs user", async ({ page }) => {
    await page.goto("/unauthorized");
    await expect(page.locator("h1")).toContainText("不在名單");
    await expect(page.getByRole("link", { name: "返回登入" })).toBeVisible();
  });

  test("health endpoint is public", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ status: "ok" });
  });
});
