import { expect, type Page } from "@playwright/test";

/**
 * The navigation rail is permanent from `lg` up and a slide-over drawer below it, and
 * every authenticated spec runs at both a desktop and a phone viewport (see
 * playwright.config.ts's `desktop`/`mobile` projects) -- so a spec that needs the nav
 * on screen asks for it here rather than assuming either shape. The toggle is rendered
 * at every viewport but `lg:hidden`, so its visibility is what tells the two apart.
 */
export async function openSidebar(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Open sidebar" });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator('nav[aria-label="Main"]')).toBeVisible();
}
