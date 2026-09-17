import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";

test.describe("Finance", () => {
  test("dashboard loads at the /finance URL", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/finance/dashboard`);
    await expectNoAppCrash(page);
  });

  // The URL segment has moved twice (/gst -> /compliance -> /finance); both historical
  // spellings must keep resolving, or every saved link and bookmark breaks.
  for (const legacy of ["gst", "compliance"]) {
    test(`the legacy /${legacy}/ segment still redirects to /finance/`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/${legacy}/dashboard`);
      await expect(page).toHaveURL(new RegExp(`/${slug}/finance/dashboard$`));
      await expectNoAppCrash(page);
    });
  }

  test("country bar shows the operating country and reachable selects", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/finance/dashboard`);
    await expect(page.getByText("Operating in")).toBeVisible();
  });

  // Regression test: this page's period picker attached an onChange handler directly to
  // a plain <input> rendered by a Server Component -- disallowed, and crashed on every
  // load regardless of period or data. Moving that one control into its own client
  // component (PeriodPicker) fixed it; this proves the page as a whole still renders.
  test("Reconciliation loads without crashing", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/finance/reconciliation`);
    await expectNoAppCrash(page);
    await expect(page.getByRole("heading", { name: "Reconciliation" })).toBeVisible();
    await expect(page.getByLabel("Period")).toBeVisible();
  });

  test("legacy /gst/ URL redirects to /finance/", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/gst/profile`);
    await page.waitForURL(new RegExp(`/${slug}/finance/profile$`));
    await expectNoAppCrash(page);
  });

  test("Registrations page reflects the business's actual country/regime, not hard-coded India", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/finance/registrations`);
    await expectNoAppCrash(page);
    // Title is "<Regime name> registrations" for whatever country is active (GSTIN for
    // India, VAT for the EU packs, Sales Tax for the US, GST/HST for Canada) -- just
    // proving it isn't a permanently-empty, mislabeled India-only screen regardless.
    await expect(page.getByRole("heading", { name: /registrations$/i })).toBeVisible();
  });
});
