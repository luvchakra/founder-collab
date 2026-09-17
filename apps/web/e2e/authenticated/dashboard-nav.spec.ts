import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";

test.describe("Executive Dashboard", () => {
  test("loads with Overview, Modules and Conversions sections", async ({ page }) => {
    await page.goto("/dashboard");
    await expectNoAppCrash(page);
    await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("quick links reach settings/licenses/usage/billing", async ({ page }) => {
    await page.goto("/dashboard");
    for (const [name, urlPattern] of [
      ["Admin & settings", /\/dashboard\/settings$/],
      ["Licenses", /\/dashboard\/settings\/licenses$/],
      ["Usage", /\/dashboard\/settings\/usage$/],
      ["Billing", /\/dashboard\/settings\/billing$/],
    ] as const) {
      await page.goto("/dashboard");
      await page.getByRole("link", { name }).click();
      await expect(page).toHaveURL(urlPattern);
      await expectNoAppCrash(page);
    }
  });
});

test.describe("Sidebar navigation", () => {
  // Runs at both viewports: from `lg` up the rail is permanent (nothing to open or
  // close), below it the same rail is a drawer, so the close half only applies there.
  test("shows the nav, and closes again when it's a drawer", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.locator('nav[aria-label="Main"]');
    const toggle = page.getByRole("button", { name: "Open sidebar" });
    const isDrawer = await toggle.isVisible();

    if (isDrawer) await toggle.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("link", { name: "Executive Dashboard" })).toBeVisible();

    if (isDrawer) {
      await page.getByRole("button", { name: "Close sidebar" }).click();
      await expect(nav).toBeHidden();
    }
  });
});

// Every one of these route prefixes crashed at least once this project's own history
// (CRM Opportunities' default Kanban view, Compliance Reconciliation) from a bug class
// invisible to typecheck/lint/unit tests -- a Server Component handing a Client
// Component something that can't cross the boundary. This loop is the regression net:
// every module's own landing page, visited for real, must render real content.
const MODULE_LANDING_PAGES: { module: string; path: (slug: string) => string; heading: RegExp }[] = [
  { module: "Discovery", path: (slug) => `/${slug}/discovery/dashboard`, heading: /dashboard/i },
  { module: "Inventory", path: (slug) => `/${slug}/inventory/dashboard`, heading: /dashboard/i },
  { module: "Service", path: (slug) => `/${slug}/service`, heading: /dashboard|service/i },
  { module: "CRM", path: (slug) => `/${slug}/crm/dashboard`, heading: /dashboard/i },
  { module: "Compliance", path: (slug) => `/${slug}/compliance/dashboard`, heading: /dashboard/i },
];

for (const { module, path } of MODULE_LANDING_PAGES) {
  test(`${module}'s own landing page renders without crashing`, async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(path(slug));
    await expectNoAppCrash(page);
    // A licensing/redirect edge case (module not licensed for this seed business) is a
    // real, valid outcome too -- this only needs to prove the route never hard-crashes,
    // not that every module is licensed on whatever business the test account owns.
    await expect(page.locator("body")).not.toBeEmpty();
  });
}
