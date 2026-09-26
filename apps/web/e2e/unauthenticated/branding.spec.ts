import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/** BRAND-06 / BRAND-07 / BRAND-08 / BRAND-12 -- the public face of the identity. */
test.describe("WonderArk branding (public)", () => {
  test("login shows the stacked WonderArk lockup and the canonical title", async ({ page }) => {
    await page.goto("/login");
    await expectNoAppCrash(page);
    // The name part is the Platform Name a superadmin publishes (Platform → Branding).
    await expect(page).toHaveTitle(/ — Business in One Place$/);
    await expect(page.locator('img[data-logo-variant="primary"]')).toBeVisible();
  });

  test("the landing page uses the canonical logo and brand theme colour", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('header img[data-logo-variant="horizontal"]')).toBeVisible();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0B1F3B");
    for (const size of ["16x16", "32x32", "48x48", "64x64"]) {
      await expect(page.locator(`link[rel="icon"][sizes="${size}"]`)).toHaveCount(1);
    }
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/brand\/apple-icon\.png/);
  });

  test("the web manifest and its icons are served to signed-out browsers", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.theme_color).toBe("#0B1F3B");
    expect(manifest.short_name).toBe("WonderArk");
    for (const icon of manifest.icons as { src: string }[]) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.ok(), icon.src).toBe(true);
      expect(iconRes.headers()["content-type"]).toContain("image/png");
    }
  });
});
