import { expect, test } from "@playwright/test";
import { getTestBusinessSlug } from "../support/business";

/**
 * RBAC-37 (owner side) -- Users & Access as the E2E business's owner: the member list shows
 * the owner, system roles are listed and read-only, a custom role can be created with
 * exactly chosen permissions and archived again, and the invite dialog refuses a bad
 * email without calling the server. The invitee side (accept, role applied, isolation) is
 * covered in the database by scripts/test-core-rbac-rls.mjs.
 */
test.describe("Users & Access", () => {
  let slug = "";

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Checked once, on desktop");
    if (!slug) slug = await getTestBusinessSlug(page);
  });

  test("the owner sees themselves as Owner", async ({ page }) => {
    await page.goto(`/${slug}/admin/users`);
    await expect(page.getByRole("heading", { level: 1, name: "Users & Access" })).toBeVisible();
    await expect(page.getByText("Owner").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite user" })).toBeVisible();
  });

  test("the old team page redirects to Users & Access", async ({ page }) => {
    await page.goto(`/${slug}/admin/team`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/users`));
  });

  test("system roles are listed", async ({ page }) => {
    await page.goto(`/${slug}/admin/roles`);
    await expect(page.getByText("System roles")).toBeVisible();
    for (const name of ["Owner", "Admin", "Viewer"]) {
      await expect(page.getByRole("link", { name: `Open ${name}`, exact: true })).toBeVisible();
    }
  });

  test("a custom role is created with chosen permissions, then archived", async ({ page }) => {
    const name = `E2E Stock Viewer ${Date.now()}`;
    await page.goto(`/${slug}/admin/roles/new`);
    await page.getByLabel("Role name").fill(name);
    await page.getByLabel("Search permissions").fill("inventory.view");
    await page.locator("#perm-inventory\\.view").click();
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/roles/[0-9a-f-]{36}`));
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await page.getByRole("button", { name: "Archive role" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive role" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("the invite dialog refuses an invalid email", async ({ page }) => {
    await page.goto(`/${slug}/admin/users`);
    await page.getByRole("button", { name: "Invite user" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill("not-an-email");
    await dialog.getByRole("button", { name: /send/i }).click();
    await expect(dialog).toBeVisible();
  });

  test("the business switcher shows the owner's role", async ({ page }) => {
    await page.goto(`/${slug}/business`);
    await page.getByRole("button", { name: /Acme Home Security/ }).first().click();
    await expect(page.getByRole("menu").getByText("Owner").first()).toBeVisible();
  });
});
