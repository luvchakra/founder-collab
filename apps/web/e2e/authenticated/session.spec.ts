import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * The other half of the auth contract, which the unauthenticated specs can't reach: what
 * happens once a session exists. These run with the shared storageState produced by
 * auth.setup.ts, i.e. a real UI login against the real Supabase project -- so the fact
 * that this project's specs run at all is itself the end-to-end proof that logging in
 * works; the checks below pin what the session is then supposed to do.
 */
test.describe("Signed-in session", () => {
  test("lands on a working dashboard rather than an error page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectNoAppCrash(page);
  });

  // Without this bounce a signed-in user following a stale /login bookmark gets the login
  // form back and reasonably concludes they have been logged out.
  test("visiting the login or signup page bounces to the dashboard", async ({ page }) => {
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      await expect(page, `${path} should not show a form to a signed-in user`).toHaveURL(
        /\/dashboard$/,
      );
    }
  });

  // The marketing page bounces too -- decided in the proxy, which is what lets "/" be
  // served as a static page to everyone else.
  test("visiting the marketing page bounces to the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // The mid-flow pages are deliberately *not* in that bounce list: a signed-in user
  // changing their password still has to be able to complete a reset.
  test("the password reset page stays reachable while signed in", async ({ page }) => {
    const response = await page.goto("/reset-password");
    expect(response?.status()).toBe(200);
    await expectNoAppCrash(page);
  });

  test("logging out returns to the login page and re-protects the dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // The account menu lives at the bottom of the nav rail, which is a drawer below `lg`
    // -- this spec runs at both viewports, so open it only where there's a toggle.
    const toggle = page.getByRole("button", { name: "Open sidebar" });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });

    // The session is really gone, not just navigated away from.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
