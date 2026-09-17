import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * Regression guard for a real outage: every page in the `(auth)` route group renders
 * through a shared layout that reads platform branding, and that read used to throw when
 * the environment had no SUPABASE_SERVICE_ROLE_KEY -- so `/login`, `/signup`,
 * `/forgot-password` and `/reset-password` all returned 500 at once and nobody could get
 * into the product at all. A 500 is exactly what the per-page "renders the form" tests
 * below could not distinguish from a selector that had simply moved, so this asserts the
 * HTTP status directly, for every page in the group, before anything else runs.
 */
test.describe("Auth pages are reachable at all", () => {
  for (const path of ["/login", "/signup", "/forgot-password", "/reset-password"]) {
    test(`${path} responds 200 and renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} must not be a server error`).toBe(200);
      await expectNoAppCrash(page);
    });
  }
});

test.describe("Login", () => {
  test("renders the form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });

  // A real call against the real Supabase project this deployment points at (CLAUDE.md:
  // "use real authorization... do not fake security behavior with UI-only checks") --
  // read-only, no account is created or mutated by a rejected login.
  test("shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-nonexistent-user@example.com");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("link to signup works", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /create your account/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});

test.describe("Signup", () => {
  test("renders the form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  });

  // Exact text, not /^log in/i: the shared `(auth)` layout also renders a "Log In" tab
  // in its header, so the loose pattern matched two links and failed on strict mode
  // rather than on anything being wrong with the page.
  test("link to login works", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: "Log in →" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  // The server action enforces this too (actions.ts), but the input's own minLength is
  // what stops a doomed round trip -- if the attribute is ever dropped, the form submits
  // and the rejection comes back from Supabase instead, which is a worse experience than
  // the browser refusing inline.
  test("refuses a password under 8 characters without submitting", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Too Short");
    await page.getByLabel("Email").fill("e2e-nonexistent-user@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByLabel("Password")).toHaveJSProperty("validity.valid", false);
  });

  // Supabase deliberately does not reveal whether an address is already registered, so
  // this lands on the same check-your-email screen a brand-new signup does. Asserting it
  // pins that behavior: a "this email is taken" error here would be an account-enumeration
  // regression, not an improvement.
  test("an already-registered email does not leak that the account exists", async ({ page }) => {
    const existing = process.env.E2E_TEST_EMAIL;
    test.skip(!existing, "Set E2E_TEST_EMAIL to a real registered account for this check");

    await page.goto("/signup");
    await page.getByLabel("Name").fill("Duplicate Signup");
    await page.getByLabel("Email").fill(existing!);
    await page.getByLabel("Password").fill("a-sufficiently-long-password");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/signup\/check-email$/, { timeout: 15_000 });
  });
});

test.describe("Route protection", () => {
  test("a signed-out visitor is redirected from a protected route to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the mid-flow auth pages stay reachable while signed out", async ({ page }) => {
    // Not protected on purpose: a redirect here would fire at the exact moment a user is
    // being told to go and check their inbox.
    for (const path of ["/signup/check-email", "/forgot-password/check-email"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} must stay reachable`).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
    }
  });
});

test.describe("Forgot password", () => {
  // Deliberately not the real E2E_TEST_EMAIL -- this exercises the UI flow only, not
  // whether a real inbox receives anything, and never sends real email traffic on every
  // run of this suite.
  test("submitting shows the check-your-email confirmation", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("e2e-nonexistent-user@example.com");
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page).toHaveURL(/\/forgot-password\/check-email$/, { timeout: 10_000 });
  });
});
