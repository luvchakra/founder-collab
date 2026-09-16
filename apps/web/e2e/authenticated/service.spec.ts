import { test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { expectResponsiveTableOrCards } from "../support/responsive";
import { getTestBusinessSlug } from "../support/business";

test.describe("Service (FSM)", () => {
  test("dashboard loads at the /service URL (not the old /fsm/ segment)", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/service`);
    await expectNoAppCrash(page);
  });

  test("Jobs list renders responsively", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/service/jobs`);
    await expectNoAppCrash(page);
    await expectResponsiveTableOrCards(page);
  });

  test("Schedule loads", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/service/schedule`);
    await expectNoAppCrash(page);
  });

  // The old /fsm/ segment must still resolve (middleware's legacy-path redirect), not
  // 404 -- covers any bookmark or external link still carrying the pre-rename URL.
  test("legacy /fsm/ URL redirects to /service/", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/fsm/jobs`);
    await page.waitForURL(new RegExp(`/${slug}/service/jobs$`));
    await expectNoAppCrash(page);
  });
});
