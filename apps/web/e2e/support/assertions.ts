import { expect, type Page } from "@playwright/test";

/**
 * Asserts the page rendered real content, not Next.js's global error boundary
 * (apps/web/app/global-error.tsx's "Something went wrong" / "An unexpected error
 * occurred"). This exact class of bug -- a Server Component handing a Client Component
 * either a plain closure wrapping a "use server" action instead of a bound reference, or
 * an event handler attached directly to an element it rendered itself -- crashed the CRM
 * Opportunities page (in its *default* view), the Compliance Reconciliation page, and the
 * platform admin tool, every one of them on first render, not on some rare interaction.
 * None of that showed up in typecheck, lint, or the vitest suites, because the failure
 * only exists once the two halves of the render actually meet in a browser -- exactly
 * what nothing else in this repo's test suite exercises. Call this after navigating to
 * any authenticated page this suite visits.
 */
export async function expectNoAppCrash(page: Page): Promise<void> {
  await expect(page.getByText("Something went wrong", { exact: false })).not.toBeVisible();
  await expect(page.getByText("An unexpected error occurred", { exact: false })).not.toBeVisible();
}
