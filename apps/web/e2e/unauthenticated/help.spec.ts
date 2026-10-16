import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * Get Help, signed out: none of it is reachable. The guides are signed-in only
 * (core/help/access.ts): the proxy sends a visitor to sign-in, remembering the page, each
 * page checks the session again, and the ask box refuses without one. The public pages
 * that stay open (sign-in, sign-up, password reset, pricing, terms, privacy) still load,
 * and no public page links to help any more.
 */
test.describe("Get Help (signed out)", () => {
  for (const path of ["/help", "/help/getting-started", "/help/finance", "/help/not-a-real-guide"]) {
    test(`${path} redirects to sign-in and remembers the page`, async ({ page }) => {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(response.status(), path).toBeLessThan(400);
      const location = new URL(response.headers()["location"]!, "http://placeholder");
      expect(location.pathname).toBe("/login");
      if (path !== "/help/not-a-real-guide") expect(location.searchParams.get("next")).toBe(path);
      // No guide text in the redirect itself.
      expect(await response.text()).not.toMatch(/Getting Started|journal entry|Banking/);
    });
  }

  test("a browser lands on sign-in with no guide text on the page", async ({ page }) => {
    await page.goto("/help/finance");
    await expect(page).toHaveURL(/\/login\?next=%2Fhelp%2Ffinance$/);
    await expect(page.getByRole("heading", { name: "Banking" })).toHaveCount(0);
    await expectNoAppCrash(page);
  });

  test("an old /dashboard/help bookmark also ends at sign-in", async ({ page }) => {
    await page.goto("/dashboard/help/finance");
    await expect(page).toHaveURL(/\/login/);
  });

  test("no public page links to help", async ({ page }) => {
    for (const path of ["/", "/pricing", "/login", "/signup", "/terms", "/privacy"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/help"]'), path).toHaveCount(0);
    }
  });

  test("the sign-in page offers a way to reach support", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", /^mailto:/);
  });

  test("the sitemap and robots.txt keep help out of search", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/help");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/help/);
  });
});

test.describe("What stays public", () => {
  for (const path of ["/", "/login", "/signup", "/forgot-password", "/pricing", "/terms", "/privacy"]) {
    test(`${path} loads signed out`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}`));
      await expectNoAppCrash(page);
    });
  }
});
