import { expect, test } from "@playwright/test";

/**
 * RBAC-27 / RBAC-36 -- an invitation link opened signed out reveals nothing about the
 * business; it only offers to sign in or sign up (the token then rides in an httpOnly
 * cookie, never in a URL).
 */
test.describe("Invitation link (signed out)", () => {
  test("offers sign-in and sign-up without revealing the business", async ({ page }) => {
    const response = await page.goto("/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "You've been invited" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to accept" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  });

  test("continuing to sign in keeps the token out of the URL", async ({ page }) => {
    await page.goto("/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/continue?to=login");
    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    const invite = cookies.find((c) => c.name === "wa_pending_invite");
    expect(invite?.httpOnly).toBe(true);
  });
});
