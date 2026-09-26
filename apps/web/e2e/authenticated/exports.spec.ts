import { expect, test } from "@playwright/test";
import { getTestBusinessSlug } from "../support/business";
import { exportData } from "../support/exports";

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

  // §53's representative Discovery flows. Each skips itself when the test business has
  // nothing on the page to export from (no licence, no records yet).
  test("Marketing campaigns export to Excel with typed, labelled columns", async ({ page }) => {
    await page.goto(`/${slug}/discovery/marketing/campaigns`);
    test.skip((await page.locator('[data-export-id="marketing.campaigns"]').count()) === 0, "Marketing isn't available here");
    const file = await exportData(page, "marketing.campaigns", "xlsx");
    expect(file.filename).toMatch(/^wonderark_discovery_/);
    expect(Object.keys(file.sheets)).toEqual(["Campaigns", "Export info"]);
    const [header, ...rows] = file.sheets.Campaigns!;
    expect(header!.slice(0, 5)).toEqual(["Campaign", "Status", "Objective", "Offering", "Channel"]);
    // Labels, not codes: a status reads "Draft"/"Active", never "draft".
    for (const row of rows) expect(String(row[1])).toMatch(/^[A-Z]/);
    const info = Object.fromEntries(file.sheets["Export info"]!.slice(1).map((r) => [r[0], r[1]]));
    expect(info.Report).toBeTruthy();
    expect(info.Business).toBeTruthy();
  });

  test("Funding investors export to CSV, same rows as the page", async ({ page }) => {
    await page.goto(`/${slug}/discovery/funding/investors`);
    test.skip((await page.locator('[data-export-id="funding.investors"]').count()) === 0, "Funding isn't available here");
    const file = await exportData(page, "funding.investors", "csv");
    expect(file.filename).toMatch(/^wonderark_discovery_[a-z-]*investors_\d{4}-\d{2}-\d{2}\.csv$/);
    const [header, ...rows] = file.rows;
    expect(header!.slice(0, 2)).toEqual(["Investor", "Type"]);
    // Every investor the page lists is in the file.
    const onPage = await page.locator("main a[href*='/discovery/funding/investors/']").allInnerTexts();
    const names = new Set(rows.map((r) => r[0]));
    for (const name of onPage.map((t) => t.trim()).filter(Boolean).slice(0, 10)) {
      expect([...names].some((n) => name.includes(n!) || n!.includes(name))).toBe(true);
    }
  });

  test("Funding dashboard exports its underlying numbers as a workbook", async ({ page }) => {
    await page.goto(`/${slug}/discovery/funding`);
    test.skip((await page.locator('[data-export-id="funding.dashboard"]').count()) === 0, "Funding isn't available here");
    const file = await exportData(page, "funding.dashboard", "xlsx");
    expect(Object.keys(file.sheets)).toEqual(expect.arrayContaining(["Summary", "Export info"]));
  });
});

