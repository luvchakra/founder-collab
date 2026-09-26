import { expect, test } from "@playwright/test";

/**
 * EXP-PLAT-05: the export endpoint is outside the proxy's session gate (it is under
 * /api), so it must refuse a signed-out caller itself -- with a JSON error, never a file
 * and never a redirect into the app.
 */
test.describe("Export endpoint (signed out)", () => {
  test("refuses a signed-out request", async ({ request }) => {
    const response = await request.get("/api/exports/marketing.campaigns?business=any&format=csv", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(response.headers()["content-disposition"]).toBeUndefined();
  });

  test("refuses a signed-out background-export download", async ({ request }) => {
    const response = await request.get("/api/exports/jobs/00000000-0000-0000-0000-000000000000/download", { maxRedirects: 0 });
    expect([302, 307]).toContain(response.status());
    expect(response.headers()["location"]).toMatch(/\/login$/);
  });
});
