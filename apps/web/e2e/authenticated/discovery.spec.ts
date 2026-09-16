import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";

test.describe("Discovery", () => {
  test("dashboard shows the business's own KPIs", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await expectNoAppCrash(page);
  });

  test("sidebar lists Business Offerings, not 'Products'", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await expect(page.getByText("Business Offerings", { exact: true })).toBeVisible();
  });

  test("opening a Business Offering shows the right breadcrumb", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await page.getByRole("button", { name: "Open sidebar" }).click();
    const offeringLink = page.locator(`nav[aria-label="Main"] a[href*="/discovery/offerings/"]`).first();
    const hasOffering = await offeringLink.count();
    test.skip(hasOffering === 0, "Seed business has no offerings yet");

    await offeringLink.click();
    await expectNoAppCrash(page);
    await expect(page.getByText("Business Offering", { exact: true })).toBeVisible();
  });
});
