import type { Page } from "@playwright/test";

/**
 * The suite never hardcodes a business slug -- seed data differs by environment (a
 * developer's own demo business, a CI seed, a staging tenant), so every authenticated
 * spec that needs "some business with every module licensed" discovers one at runtime
 * instead. Optionally overridden via E2E_TEST_BUSINESS_SLUG when a spec needs a specific
 * business's data, not just any business (see docs/testing/e2e-playwright.md).
 */
export async function getTestBusinessSlug(page: Page): Promise<string> {
  const pinned = process.env.E2E_TEST_BUSINESS_SLUG;
  if (pinned) return pinned;

  await page.goto("/dashboard");
  // The sidebar drawer's own nav content is always business-scoped links
  // (/<slug>/discovery/dashboard, /<slug>/discovery/offerings/..., or a module's own
  // /<slug>/<module>/... nav tree) except the one pinned "All My Businesses" link to the
  // bare /dashboard -- opening the drawer and reading the first non-/dashboard link back
  // is the same path a person takes, so it only ever finds a business/slug the UI itself
  // would actually navigate to.
  await page.getByRole("button", { name: "Open sidebar" }).click();
  const firstBusinessLink = page.locator('nav[aria-label="Main"] a[href^="/"]:not([href="/dashboard"])').first();
  await firstBusinessLink.waitFor({ state: "visible", timeout: 10_000 });
  const href = await firstBusinessLink.getAttribute("href");
  const slug = href?.split("/")[1];
  if (!slug) {
    throw new Error(
      "Could not discover a business slug from the sidebar -- seed at least one business " +
        "for the E2E test account, or set E2E_TEST_BUSINESS_SLUG.",
    );
  }
  return slug;
}
