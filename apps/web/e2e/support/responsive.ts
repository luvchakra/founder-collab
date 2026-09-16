import { expect, type Page } from "@playwright/test";

/**
 * CLAUDE.md non-negotiable #12: any page whose primary content is a table of rows must
 * show compact cards below the `md` breakpoint (640px in this app's own convention --
 * every such page pairs a `<ul class="... md:hidden">` card list with a
 * `<Table class="hidden md:table">`), never a horizontally-scrolling or truncated table.
 * Runs the exact same check regardless of which project (desktop/mobile) invoked it --
 * only one of the two locators is ever expected to be visible, whichever matches the
 * current viewport.
 */
export async function expectResponsiveTableOrCards(page: Page, opts: { tableSelector?: string; cardListSelector?: string } = {}): Promise<void> {
  const table = page.locator(opts.tableSelector ?? "table.md\\:table").first();
  const cardList = page.locator(opts.cardListSelector ?? "ul.md\\:hidden, div.md\\:hidden").first();
  const viewport = page.viewportSize();
  const isMobile = (viewport?.width ?? 1280) < 768;

  if (isMobile) {
    await expect(cardList).toBeVisible();
    await expect(table).toBeHidden();
  } else {
    await expect(table).toBeVisible();
    await expect(cardList).toBeHidden();
  }
}
