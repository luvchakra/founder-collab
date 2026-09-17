import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { getTestBusinessSlug } from "../support/business";

/**
 * Not a regression test -- a documentation tool. Walks every screen listed in
 * docs/user-guides/ and saves a screenshot (desktop project -> full viewport,
 * mobile project -> full page) so the user guides can be illustrated with real
 * captures instead of mockups. Opt-in only (CAPTURE_SCREENSHOTS=1) so it never
 * slows down or adds noise to the normal `npm run e2e` smoke run.
 *
 * Usage: CAPTURE_SCREENSHOTS=1 npx playwright test capture-screenshots
 * Output: apps/web/e2e/screenshots/<desktop|mobile>/<name>.png
 */
test.skip(!process.env.CAPTURE_SCREENSHOTS, "opt-in only -- set CAPTURE_SCREENSHOTS=1 to run");

const OUT_ROOT = `${__dirname}/../screenshots`;

const STATIC_PAGES: { name: string; path: string }[] = [
  { name: "00-executive-dashboard", path: "/dashboard" },
  { name: "00-settings-hub", path: "/dashboard/settings" },
  { name: "00-licenses", path: "/dashboard/settings/licenses" },
  { name: "00-billing", path: "/dashboard/settings/billing" },
  { name: "00-usage", path: "/dashboard/settings/usage" },
];

// Paths that hang off a business slug, one file per module guide.
const BUSINESS_PAGES: { name: string; path: (slug: string) => string }[] = [
  { name: "00-admin-team", path: (s) => `/${s}/admin/team` },
  { name: "00-admin-api-keys", path: (s) => `/${s}/admin/api-keys` },

  { name: "01-discovery-dashboard", path: (s) => `/${s}/discovery/dashboard` },
  { name: "01-discovery-business", path: (s) => `/${s}/business` },

  { name: "02-inventory-dashboard", path: (s) => `/${s}/inventory/dashboard` },
  { name: "02-inventory-products", path: (s) => `/${s}/inventory/products` },
  { name: "02-inventory-purchase-orders", path: (s) => `/${s}/inventory/purchase-orders` },
  { name: "02-inventory-sales-orders", path: (s) => `/${s}/inventory/sales-orders` },
  { name: "02-inventory-warehouses", path: (s) => `/${s}/inventory/warehouses` },

  { name: "03-service-dashboard", path: (s) => `/${s}/service` },
  { name: "03-service-opportunities", path: (s) => `/${s}/service/opportunities` },
  { name: "03-service-jobs", path: (s) => `/${s}/service/jobs` },
  { name: "03-service-schedule", path: (s) => `/${s}/service/schedule` },
  { name: "03-service-invoices", path: (s) => `/${s}/service/invoices` },

  { name: "04-crm-dashboard", path: (s) => `/${s}/crm/dashboard` },
  { name: "04-crm-inbox", path: (s) => `/${s}/crm` },
  { name: "04-crm-conversations", path: (s) => `/${s}/crm/conversations` },
  { name: "04-crm-leads", path: (s) => `/${s}/crm/leads` },
  { name: "04-crm-opportunities", path: (s) => `/${s}/crm/opportunities` },
  { name: "04-crm-follow-ups", path: (s) => `/${s}/crm/follow-ups` },
  { name: "04-crm-lost-business", path: (s) => `/${s}/crm/lost-business` },
  { name: "04-crm-channels", path: (s) => `/${s}/crm/channels` },

  { name: "05-finance-dashboard", path: (s) => `/${s}/finance/dashboard` },
  { name: "05-finance-registrations", path: (s) => `/${s}/finance/registrations` },
  { name: "05-finance-reconciliation", path: (s) => `/${s}/finance/reconciliation` },
  { name: "05-finance-filing", path: (s) => `/${s}/finance/filing` },
];

test("capture static pages", async ({ page }, testInfo) => {
  const outDir = `${OUT_ROOT}/${testInfo.project.name}`;
  mkdirSync(outDir, { recursive: true });

  for (const { name, path } of STATIC_PAGES) {
    await page.goto(path);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  }
});

test("capture business-scoped pages", async ({ page }, testInfo) => {
  const outDir = `${OUT_ROOT}/${testInfo.project.name}`;
  mkdirSync(outDir, { recursive: true });

  const slug = await getTestBusinessSlug(page);

  for (const { name, path } of BUSINESS_PAGES) {
    await page.goto(path(slug));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  }
});
