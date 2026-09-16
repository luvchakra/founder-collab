import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads with hero, modules, pricing and footer", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /create your account|sign up|get started/i }).first()).toBeVisible();

    // Pricing tiers -- CLAUDE.md's own product decision names these three exactly.
    for (const tier of ["Free", "Pro", "Max"]) {
      await expect(page.getByText(tier, { exact: true }).first()).toBeVisible();
    }

    await expect(page.locator("footer")).toBeVisible();
  });

  test("has no horizontal overflow at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("nav links reach login and signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await page.getByRole("link", { name: /create your account|sign up|get started/i }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
