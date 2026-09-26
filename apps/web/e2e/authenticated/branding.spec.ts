import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

/**
 * BRAND-05 / BRAND-10 / BRAND-12 (docs/plan/16-BRANDING-BACKLOG.md) -- every module shares
 * the one WonderArk identity: the same logo in the rail (desktop rail and mobile drawer
 * alike, via playwright.config.ts's two projects), the "{Page} | WonderArk" tab title,
 * and the brand favicon. Structural checks, not pixel comparisons (§32).
 */
const MODULE_PAGES = [
  ["discovery/dashboard", "Discovery"],
  ["discovery/marketing", "Marketing"],
  ["discovery/funding", "Funding"],
  ["inventory/dashboard", "Inventory"],
  ["service/dashboard", "Service"],
  ["crm/dashboard", "CRM"],
  ["finance/dashboard", "Finance"],
] as const;

test.describe("WonderArk identity across modules", () => {
  for (const [path, title] of MODULE_PAGES) {
    test(`${title} carries the WonderArk logo and title`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/${path}`);
      await expectNoAppCrash(page);
      await expect(page).toHaveTitle(new RegExp(`\\| WonderArk$`));
      await openSidebar(page);
      // The rail's home link, named for the platform, holding the board's navy-ground mark.
      const home = page.getByRole("link", { name: "WonderArk" }).first();
      await expect(home.locator('img[data-logo-variant="mark-dark"]')).toBeVisible();
      await expect(page.locator('link[rel="icon"][sizes="16x16"]')).toHaveAttribute("href", /\/brand\/favicon-16\.png/);
    });
  }
});
