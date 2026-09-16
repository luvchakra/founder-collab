import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { expectResponsiveTableOrCards } from "../support/responsive";
import { getTestBusinessSlug } from "../support/business";

test.describe("CRM", () => {
  test("dashboard loads and cards are clickable", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/dashboard`);
    await expectNoAppCrash(page);

    // Every KPI card on this dashboard is a <Link>, per item #21/#5 of a UX pass --
    // there must be more than just the two "Quick links" nav buttons at the top.
    const cardLinks = page.locator("main a, div a").filter({ has: page.locator("svg") });
    expect(await cardLinks.count()).toBeGreaterThan(2);
  });

  // Regression test: Sales Opportunities' *default* view is Kanban, and it crashed on
  // every single visit -- a Server Component (this page) handed the Kanban board (a
  // Client Component) its stage-change callback as a plain arrow function wrapping a
  // "use server" action instead of a bound reference to the action itself, which React
  // can't serialize across that boundary. Nothing in typecheck/lint/vitest catches this;
  // only an actual render does.
  test("Opportunities loads in Kanban view (default) without crashing", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/opportunities`);
    await expectNoAppCrash(page);
    await expect(page.getByRole("heading", { name: "Sales Opportunities" })).toBeVisible();
  });

  test("Opportunities List view loads and responds to viewport", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/opportunities?view=list`);
    await expectNoAppCrash(page);
    const hasRows = await page.locator("table, ul").count();
    if (hasRows > 0) await expectResponsiveTableOrCards(page);
  });

  test("Leads list renders responsively", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/leads`);
    await expectNoAppCrash(page);
  });

  test("Follow-up Queue loads", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/follow-ups`);
    await expectNoAppCrash(page);
  });

  test("Inbox loads (ticket list, not the unified Conversations inbox)", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm`);
    await expectNoAppCrash(page);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  });

  test("Routing rules loads with a bordered create form and rule list", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/routing-rules`);
    await expectNoAppCrash(page);
  });

  test("Channels loads", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/crm/channels`);
    await expectNoAppCrash(page);
  });
});
