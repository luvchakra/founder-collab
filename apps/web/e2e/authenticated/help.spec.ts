import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { openSidebar } from "../support/sidebar";

/**
 * Get Help: the hub, one guide page, and the ask box.
 *
 * These pages are generated from docs/user-guides/*.md, so the interesting failures are
 * not "does React render" but "did the content survive the trip": a guide with no
 * sections, an anchor the FAQ links to that no longer exists, markdown rendered with its
 * asterisks still in it. Each of those looks fine to a typecheck and wrong to a person.
 */
test.describe("Get Help", () => {
  test("is reachable from the account menu", async ({ page }) => {
    await page.goto("/dashboard");
    await openSidebar(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Get Help" }).click();
    await expect(page).toHaveURL(/\/dashboard\/help$/);
    await expectNoAppCrash(page);
  });

  test("lists the guides and offers the ask box", async ({ page }) => {
    await page.goto("/dashboard/help");
    await expect(page.getByRole("heading", { name: "Get Help", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Your question").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Getting Started/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Finance/ })).toBeVisible();
  });

  test("a FAQ answer opens and links into the guide it came from", async ({ page }) => {
    await page.goto("/dashboard/help");
    const question = page.getByText("I made a mistake in a journal entry. Can I edit it?");
    await question.click();
    await expect(page.getByText(/Correction is by reversal/)).toBeVisible();

    const readMore = page
      .locator("details[open]")
      .getByRole("link", { name: /read the full section/i });
    await readMore.click();
    await expect(page).toHaveURL(/\/dashboard\/help\/finance#accounting-periods$/);
    // The anchor has to resolve to a real section, or the link lands nowhere.
    await expect(page.locator("#accounting-periods")).toBeVisible();
  });

  test("a guide page renders its sections with formatting applied, not raw markdown", async ({ page }) => {
    await page.goto("/dashboard/help/finance");
    await expect(page.getByRole("heading", { name: /^Finance/, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Banking", level: 2 })).toBeVisible();

    // Bold in the source must arrive as bold, not as asterisks on screen.
    await expect(page.getByText("**", { exact: false })).toHaveCount(0);
    await expect(page.locator("main strong").first()).toBeVisible();
    await expectNoAppCrash(page);
  });

  test("every guide in the index opens", async ({ page }) => {
    await page.goto("/dashboard/help");
    // Fragments dropped: the page carries FAQ links into specific sections too, and
    // navigating to a URL that differs only by its hash is not a navigation at all --
    // page.goto returns null and there is no status to check.
    const hrefs = await page
      .locator('a[href^="/dashboard/help/"]')
      .evaluateAll((links) => [
        ...new Set(links.map((link) => link.getAttribute("href")!.split("#")[0])),
      ]);
    expect(hrefs.length).toBeGreaterThanOrEqual(6);

    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} must not be a server error`).toBe(200);
      await expect(page.locator("main section[id]").first()).toBeVisible();
    }
  });

  /**
   * The assistant answers from the guides, and the sections it cites are chosen before
   * the model runs -- so this must produce links whether or not the deployment has an AI
   * key configured. Without one it degrades to "here are the matching sections", which is
   * a different answer but not a failure, and this asserts the part that holds either way.
   */
  test("the ask box answers with links into the guides", async ({ page }) => {
    await page.goto("/dashboard/help");
    await page.getByLabel("Your question").first().fill("How do I reconcile a bank statement?");
    // Exact: the app shell has its own "Ask the AI assistant" button.
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const sources = page.getByRole("link", { name: /Banking/ });
    await expect(sources.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("How do I reconcile a bank statement?").first()).toBeVisible();
  });

  // Asserted on what the visitor sees rather than the status code: this route streams, so
  // the response headers are already on the wire by the time notFound() runs and the
  // status stays 200 even though the not-found page is what renders. The thing that
  // matters -- nobody gets a blank page or a stack trace -- is the body.
  test("an unknown guide shows the not-found page rather than an empty or broken one", async ({ page }) => {
    await page.goto("/dashboard/help/not-a-real-guide");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.locator("main section[id]")).toHaveCount(0);
  });
});
