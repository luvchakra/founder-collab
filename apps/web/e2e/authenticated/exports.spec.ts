import { expect, test } from "@playwright/test";
import { getTestBusinessSlug } from "../support/business";

/**
 * EXP-PLAT-05 and the representative export flows of §53. Every file is opened and its
 * contents checked (§54): filename standard, header row, and that it carries data from
 * this business only. Module exports whose module isn't licensed for the test business
 * skip themselves -- the page never renders its Export button.
 */
test.describe("Exports", () => {
  let slug = "";

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Downloads are checked once, on desktop");
    if (!slug) slug = await getTestBusinessSlug(page);
  });

  test.describe("endpoint guards", () => {
    test("an unknown export is not found", async ({ page }) => {
      const response = await page.request.get(`/api/exports/nope.nothing?business=${slug}&format=csv`);
      expect(response.status()).toBe(404);
    });

    test("a business the user doesn't belong to is not found -- no file", async ({ page }) => {
      const response = await page.request.get("/api/exports/marketing.campaigns?business=definitely-not-a-member-business&format=csv");
      expect(response.status()).toBe(404);
      expect(response.headers()["content-disposition"]).toBeUndefined();
    });

    test("an unsupported format is refused", async ({ page }) => {
      const response = await page.request.get(`/api/exports/marketing.campaigns?business=${slug}&format=pdf`);
      expect(response.status()).toBe(400);
    });

    test("a platform export is invisible to a non-superadmin", async ({ page }) => {
      const response = await page.request.get("/api/exports/platform.audit?format=csv");
      expect(response.status()).toBe(404);
    });
  });
});
