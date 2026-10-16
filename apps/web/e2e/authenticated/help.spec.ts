import { expect, test } from "@playwright/test";
import { openSidebar } from "../support/sidebar";

/**
 * Get Help, signed in. The guides are signed-in only (core/help/access.ts); the signed-out
 * side -- every help route redirecting to sign-in -- is e2e/unauthenticated/help.spec.ts.
 */
test.describe("Get Help (signed in)", () => {
  test("is reachable from the account menu", async ({ page }) => {
    await page.goto("/dashboard");
    await openSidebar(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Get Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  /**
   * Without an AI credential configured on this deployment the answer degrades to the
   * matching sections only (labelled "Where to look"), which is still correct, not a
   * failure -- so this asserts only the part that holds either way: real links into the
   * guides.
   */
  test("the ask box answers with links into the guides", async ({ page }) => {
    await page.goto("/help");
    await page.getByLabel("Your question").first().fill("How do I reconcile a bank statement?");
    // Exact: the app shell has its own "Ask the AI assistant" button.
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const sources = page.getByRole("link", { name: /Banking/ });
    await expect(sources.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("How do I reconcile a bank statement?").first()).toBeVisible();
  });

  test("the hub and every guide render, with no cache that a signed-out visitor could share", async ({ page }) => {
    const hub = await page.goto("/help");
    expect(hub?.status()).toBe(200);
    expect(hub?.headers()["cache-control"] ?? "").not.toMatch(/public/);
    await expect(page.getByRole("heading", { name: "Get Help", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const hrefs = await page
      .locator('a[href^="/help/"]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")!.split("#")[0]))]);
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      expect(response?.headers()["cache-control"] ?? "", href).not.toMatch(/public/);
      await expect(page.locator("main section[id]").first()).toBeVisible();
    }
  });

  test("a FAQ answer opens and links into the guide it came from", async ({ page }) => {
    await page.goto("/help");
    await page.getByText("I made a mistake in a journal entry. Can I edit it?").click();
    await page.locator("details[open]").getByRole("link", { name: /read the full section/i }).click();
    await expect(page).toHaveURL(/\/help\/finance#accounting-periods$/);
    await expect(page.locator("#accounting-periods")).toBeVisible();
  });
});
