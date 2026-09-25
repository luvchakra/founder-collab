import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { expandNavGroup, openSidebar } from "../support/sidebar";

// MKT-03..14 / DISC-NAV-04. Every Marketing page renders for real (the Server/Client
// boundary crash class only shows up in a browser), and the sidebar reaches them.
const PAGES = ["", "/strategy", "/campaigns", "/campaigns/new", "/content", "/content?view=calendar", "/content/new", "/assets", "/website-seo", "/analytics"];

test.describe("Discovery › Marketing", () => {
  for (const path of PAGES) {
    test(`marketing${path || " dashboard"} renders`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/discovery/marketing${path}`);
      await expectNoAppCrash(page);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }

  test("the sidebar lists Marketing's pages under Discovery", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    await expandNavGroup(page, "Marketing");
    const nav = page.locator('nav[aria-label="Main"]');
    for (const label of ["Strategy", "Campaigns", "Content", "Assets", "Website & SEO"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("a campaign cannot be saved without a name", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/marketing/campaigns/new`);
    await expectNoAppCrash(page);
    const save = page.getByRole("button", { name: "Save as draft" });
    test.skip((await save.count()) === 0, "Test account cannot manage marketing");
    await save.click();
    // The browser's own required-field check stops the submit; the page does not move.
    await expect(page).toHaveURL(/campaigns\/new/);
  });
});
