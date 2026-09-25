import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { expandNavGroup, openSidebar } from "../support/sidebar";

// FND-03..14 / DISC-NAV-05. Every Funding page renders for real, and the sidebar reaches them.
const PAGES = ["", "/profile", "/readiness", "/rounds", "/investors", "/outreach", "/outreach/new", "/data-room", "/due-diligence", "/analytics"];

test.describe("Discovery › Funding", () => {
  for (const path of PAGES) {
    test(`funding${path || " dashboard"} renders`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/discovery/funding${path}`);
      await expectNoAppCrash(page);
      await expect(page.locator("main").first()).toBeVisible();
    });
  }

  test("the sidebar lists Funding's pages under Discovery", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    await expandNavGroup(page, "Funding");
    const nav = page.locator('nav[aria-label="Main"]');
    for (const label of ["Funding Profile", "Investor Readiness", "Fundraising", "Data Room", "Due Diligence"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("a share link that does not exist reveals nothing", async ({ page }) => {
    const response = await page.goto(`/p/dr/${"x".repeat(43)}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("This link is not valid.")).toBeVisible();
  });
});
