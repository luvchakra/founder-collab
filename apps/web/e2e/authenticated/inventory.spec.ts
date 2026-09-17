import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { expectResponsiveTableOrCards } from "../support/responsive";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

test.describe("Inventory", () => {
  test("dashboard loads", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/dashboard`);
    await expectNoAppCrash(page);
  });

  test("Products list renders responsively (table on desktop, cards on mobile)", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/products`);
    await expectNoAppCrash(page);
    await expectResponsiveTableOrCards(page);
  });

  // Team & permissions moved out of Inventory's own menu into the business-level
  // /admin/team config -- regression guard for that move (item #1/#3 of a UX pass).
  test("Administration nav no longer has a Team item", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/dashboard`);
    await openSidebar(page);
    await expect(page.locator('nav[aria-label="Main"] a[href$="/inventory/team"]')).toHaveCount(0);
  });
});
