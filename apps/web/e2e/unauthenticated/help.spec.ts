import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";

/**
 * Get Help, signed out: the hub, one guide page, the FAQ, and the ask box's free
 * (retrieval-only) path -- all of it public, on purpose. `/help` needs no session
 * (core/db/middleware.ts's RESERVED_TOP_SEGMENTS), because the person who most needs the
 * documentation is often the one who cannot get in: a locked-out founder, or someone
 * deciding whether to sign up at all.
 *
 * These pages are generated from docs/user-guides/*.md, so the interesting failures are
 * not "does React render" but "did the content survive the trip": a guide with no
 * sections, an anchor the FAQ links to that no longer exists, markdown rendered with its
 * asterisks still in it. Each of those looks fine to a typecheck and wrong to a person.
 */
test.describe("Get Help (signed out)", () => {
  test("is reachable directly, with no redirect to login", async ({ page }) => {
    const response = await page.goto("/help");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/help$/);
    await expectNoAppCrash(page);
  });

  test("is reachable from the marketing navbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Help", exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("is reachable from the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Help", exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("lists the guides and offers the ask box", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Get Help", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Your question").first()).toBeVisible();

    // Scoped to the guide cards, not the whole page: `/help` wears the marketing site's
    // own footer (HelpLayout), whose "Modules" column also links a bare "Finance" anchor
    // back to the landing page, and a loose match resolves to both.
    const guides = page.getByRole("region", { name: "User guides" });
    await expect(guides.getByRole("link", { name: /Getting Started/ })).toBeVisible();
    await expect(guides.getByRole("link", { name: /Finance/ })).toBeVisible();
  });

  test("a FAQ answer opens and links into the guide it came from", async ({ page }) => {
    await page.goto("/help");
    const question = page.getByText("I made a mistake in a journal entry. Can I edit it?");
    await question.click();
    await expect(page.getByText(/Correction is by reversal/)).toBeVisible();

    const readMore = page
      .locator("details[open]")
      .getByRole("link", { name: /read the full section/i });
    await readMore.click();
    await expect(page).toHaveURL(/\/help\/finance#accounting-periods$/);
    // The anchor has to resolve to a real section, or the link lands nowhere.
    await expect(page.locator("#accounting-periods")).toBeVisible();
  });

  test("a guide page renders its sections with formatting applied, not raw markdown", async ({ page }) => {
    await page.goto("/help/finance");
    await expect(page.getByRole("heading", { name: /^Finance/, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Banking", level: 2 })).toBeVisible();

    // Bold in the source must arrive as bold, not as asterisks on screen.
    await expect(page.getByText("**", { exact: false })).toHaveCount(0);
    await expect(page.locator("main strong").first()).toBeVisible();
    await expectNoAppCrash(page);
  });

  test("every guide in the index opens, with no session", async ({ page }) => {
    await page.goto("/help");
    // Fragments dropped: the page carries FAQ links into specific sections too, and
    // navigating to a URL that differs only by its hash is not a navigation at all --
    // page.goto returns null and there is no status to check.
    const hrefs = await page
      .locator('a[href^="/help/"]')
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
   * Signed out, the ask box still answers -- with the guide sections that match, not an
   * AI-written summary (core/help/assistant.ts's searchHelpSections): finding the right
   * sections is free deterministic keyword scoring, but writing prose costs the
   * platform's own AI credit, so that half is gated on a session (app/help/actions.ts).
   * The label says which mode produced it ("Where to look" rather than "Read more") so
   * this asserts the distinction, not just that links showed up.
   */
  test("the ask box answers with matching sections, not a written answer", async ({ page }) => {
    await page.goto("/help");
    await page.getByLabel("Your question").first().fill("How do I reconcile a bank statement?");
    // Exact: the app shell has its own "Ask the AI assistant" button.
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    await expect(page.getByText("Where to look")).toBeVisible({ timeout: 10_000 });
    const sources = page.getByRole("link", { name: /Banking/ });
    await expect(sources.first()).toBeVisible();
    await expect(page.getByText("How do I reconcile a bank statement?").first()).toBeVisible();
  });

  test("an unrelated question says nothing was found, not an error", async ({ page }) => {
    await page.goto("/help");
    await page.getByLabel("Your question").first().fill("xyzzy plugh quantum walrus");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(/couldn't find anything/i)).toBeVisible({ timeout: 10_000 });
  });

  // Asserted on what the visitor sees rather than the status code: this route streams, so
  // the response headers are already on the wire by the time notFound() runs and the
  // status stays 200 even though the not-found page is what renders. The thing that
  // matters -- nobody gets a blank page or a stack trace -- is the body.
  test("an unknown guide shows the not-found page rather than an empty or broken one", async ({ page }) => {
    await page.goto("/help/not-a-real-guide");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.locator("main section[id]")).toHaveCount(0);
  });

  test("an old /dashboard/help bookmark redirects to the public route", async ({ page }) => {
    const response = await page.goto("/dashboard/help/finance");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/help\/finance$/);
  });
});
