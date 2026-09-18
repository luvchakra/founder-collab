import { expect, test as setup } from "@playwright/test";

const AUTH_FILE = "playwright/.auth/user.json";

/**
 * Runs once (Playwright's own "setup project" pattern -- projects.desktop/mobile both
 * declare dependencies: ["setup"]), signs in through the real login form against the
 * real Supabase project this deployment points at, and saves the resulting cookies so
 * every other spec starts already authenticated. Never mints a session any other way
 * (no API shortcut, no seeded storageState checked into the repo) -- a fake session
 * would stop this suite from ever catching an auth/authorization regression, which is
 * the whole point of using real login here.
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set to a real account on the " +
        "Supabase project this deployment points at -- see docs/testing/e2e-playwright.md.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  // Exact: the reveal toggle beside this field is labelled "Show password", which a loose
  // label lookup also matches -- two elements, and strict mode rejects both.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In" }).click();

  // Lands on the Executive Dashboard on success; a bad login re-renders /login with an
  // error instead, so waiting for this URL fails the setup loudly rather than saving a
  // signed-out storageState that would make every dependent test fail confusingly later.
  await page.waitForURL(/\/dashboard(?:$|[/?])/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
