import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * The public pages a visitor reads before signing up -- pricing and the legal documents --
 * and the two files a search engine fetches first. All of them must be served to someone
 * with no session: core/db/middleware.ts's RESERVED_TOP_SEGMENTS used to omit them, so
 * every one of these redirected to /login and the public site could not be indexed.
 */
test.describe("Public pages (signed out)", () => {
  for (const [path, heading] of [
    ["/pricing", "Pricing"],
    ["/terms", "Terms of Service"],
    ["/privacy", "Privacy Policy"],
  ] as const) {
    test(`${path} is served without a redirect to login`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expectNoAppCrash(page);
    });
  }

  test("the legal documents link each section from their contents list", async ({ page }) => {
    await page.goto("/privacy");
    const contents = page.getByRole("navigation", { name: "Contents" });
    await contents.getByRole("link", { name: "Your rights" }).click();
    await expect(page).toHaveURL(/\/privacy#rights$/);
    await expect(page.getByRole("heading", { name: /Your rights/ })).toBeInViewport();
  });

  test("pricing offers a free start and shows AI credit packs", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("link", { name: /start free/i }).first()).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("heading", { name: "AI usage" })).toBeVisible();
  });

  test("the footer links to pricing, terms and privacy", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    await expect(footer.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  test("sign-up and login link the legal documents", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  });

  test("robots.txt is served and points crawlers at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Disallow: /dashboard");
    expect(body).toMatch(/Sitemap: \S+\/sitemap\.xml/);
  });

  test("sitemap.xml lists the public pages and nothing behind a login", async ({ request }) => {
    const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const path of ["/pricing", "/terms", "/privacy", "/help"]) expect(body).toContain(`${path}</loc>`);
    expect(body).not.toContain("/dashboard");
  });
});
