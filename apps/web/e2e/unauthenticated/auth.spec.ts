import { expect, test, type Page } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * The email/password form specifically -- `/login` also carries a second form for the
 * Google button, and `next dev` adds its own role="alert" element for the dev-tools
 * overlay, so assertions about *this* form's error message have to be scoped to it.
 */
function credentialsForm(page: Page) {
  return page.locator("form:has(#password)");
}

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
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });

  // A real call against the real Supabase project this deployment points at (CLAUDE.md:
  // "use real authorization... do not fake security behavior with UI-only checks") --
  // read-only, no account is created or mutated by a rejected login.
  test("shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-nonexistent-user@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
    await page.getByRole("button", { name: "Log In" }).click();
    // Scoped to the credentials form: `next dev` renders its own role="alert" element for
    // the dev-tools overlay on every page, so an unscoped getByRole("alert") resolves to
    // two elements and fails on strict mode instead of on anything about the login.
    await expect(credentialsForm(page).getByRole("alert")).toBeVisible({ timeout: 10_000 });
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
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
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
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByLabel("Password", { exact: true })).toHaveJSProperty("validity.valid", false);
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
    await page.getByLabel("Password", { exact: true }).fill("a-sufficiently-long-password");
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

/**
 * The reveal toggle. Typing a password you cannot see is the one moment in signing up
 * where a typo costs the whole attempt, and on a phone it is not a rare one.
 *
 * Tested here rather than as a component test because checking it needs a real DOM, and
 * adding jsdom + testing-library for one component is exactly the dependency CLAUDE.md
 * principle 2 rules out. Playwright is already here and tests the real thing.
 */
test.describe("Password reveal", () => {
  for (const [name, path, label] of [
    ["login", "/login", "Password"],
    ["signup", "/signup", "Password"],
  ] as const) {
    test(`${name}: the password is hidden until asked for, then revealed`, async ({ page }) => {
      await page.goto(path);
      const field = page.getByLabel(label, { exact: true });

      // Hidden by default: a password is never on screen because of an earlier choice.
      await expect(field).toHaveAttribute("type", "password");

      await field.fill("correct horse battery staple");
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(field).toHaveAttribute("type", "text");
      // The value survives the toggle — re-rendering the input must not clear what was typed.
      await expect(field).toHaveValue("correct horse battery staple");

      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(field).toHaveAttribute("type", "password");
      await expect(field).toHaveValue("correct horse battery staple");
    });
  }

  // An explicit type="button" is what stops this: without it the toggle inherits submit
  // and reveals the password by navigating away.
  test("toggling does not submit the form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-nonexistent-user@example.com");
    await page.getByLabel("Password", { exact: true }).fill("something");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(credentialsForm(page).getByRole("alert")).toHaveCount(0);
  });

  test("the toggle is reachable by keyboard and announces its state", async ({ page }) => {
    await page.goto("/login");
    const toggle = page.getByRole("button", { name: "Show password" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  // /reset-password's two fields are also reveal fields, but they only render for a
  // visitor arriving on a live recovery link -- signed out, the page shows the
  // invalid-link message instead, so there is nothing here to toggle. Each PasswordInput
  // owns its own reveal state, so the two fields are independent by construction; what
  // this suite can check unauthenticated is that the dead-link path still offers a way
  // back rather than stranding someone on an expired email.
  test("reset-password without a recovery link points back at forgot password", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});

test.describe("Forgot password", () => {
  // The link exists on the login page, but a link nobody can follow is the same as no
  // link -- this walks the route a locked-out founder actually takes.
  test("is reachable from the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("offers a way back to signing in", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
  });

  test("asks for an email rather than submitting an empty form", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valid", false);
  });

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

/**
 * Google sign-in is only offered when the Supabase project actually has the provider
 * turned on -- a "Continue with Google" button on a project where Google is disabled
 * comes back with "Unsupported provider", which reads as a broken app rather than an
 * unfinished setup step.
 *
 * So this asserts the button against the project's own answer rather than against a
 * hardcoded expectation: whichever way the deployment is configured, the page has to
 * agree with it.
 */
test.describe("Google sign-in", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  for (const path of ["/login", "/signup"]) {
    test(`${path} offers Google exactly when the project enables it`, async ({ page, request }) => {
      test.skip(
        !supabaseUrl || !supabaseKey,
        "Needs NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY in the test runner's own environment",
      );

      const settings = await request.get(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: supabaseKey! },
      });
      expect(settings.ok(), "the project's auth settings must be readable").toBe(true);
      const enabled = Boolean((await settings.json()).external?.google);

      await page.goto(path);
      const button = page.getByRole("button", { name: /continue with google/i });
      await expect(button).toHaveCount(enabled ? 1 : 0);

      // The "OR" divider belongs to that button -- it must not be left behind on its own.
      await expect(page.getByText("OR", { exact: true })).toHaveCount(enabled ? 1 : 0);
    });
  }
});
