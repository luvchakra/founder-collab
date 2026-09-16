import { expect, test } from "@playwright/test";

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

  test("link to login works", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: /^log in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
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
