import { expect, test } from "@playwright/test";

/**
 * PWA smoke — manifest + icon routes must be publicly reachable (no auth
 * gate), return the right content types, and carry the fields a browser
 * needs to mark the app installable.
 */
test.describe("pwa installability", () => {
  test("manifest.webmanifest exposes required PWA fields", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/application\/manifest\+json|application\/json/);

    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
      theme_color: string;
      background_color: string;
    };

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(1);

    const has512 = manifest.icons.some((i) => i.sizes === "512x512");
    expect(has512, "needs at least one 512x512 icon for install prompt").toBe(true);
  });

  test("/icon serves a PNG image", async ({ request }) => {
    const res = await request.get("/icon");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    // PNG magic bytes 89 50 4E 47
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
    expect(body[2]).toBe(0x4e);
    expect(body[3]).toBe(0x47);
  });

  test("/apple-icon serves a PNG image", async ({ request }) => {
    const res = await request.get("/apple-icon");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
  });
});
