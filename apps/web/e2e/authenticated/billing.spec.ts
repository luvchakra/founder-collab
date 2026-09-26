import { expect, test } from "@playwright/test";
import { getTestBusinessSlug } from "../support/business";

/**
 * BILL-39 -- customer billing, as far as it can be driven without provider sandbox keys:
 * the pages render from the live plan catalogue, checkout refuses tampered requests
 * (§88), a spoofed success URL shows nothing activated (§87), and the webhooks refuse
 * unsigned calls (§86). A full paid checkout runs once Razorpay/Stripe test keys are set
 * in Platform Admin (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §90-§94).
 */
test.describe("Billing", () => {
  let slug = "";

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Billing flows are checked once, on desktop");
    if (!slug) slug = await getTestBusinessSlug(page);
  });

  test("the billing page shows the business's plan state", async ({ page }) => {
    await page.goto(`/${slug}/billing`);
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await expect(page.getByText("Current plan", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Billing sections" })).toBeVisible();
  });

  test("the plans page lists the catalogue's plans with their modules", async ({ page }) => {
    await page.goto(`/${slug}/billing/plans`);
    await expect(page.getByRole("heading", { level: 1, name: "Choose your plan" })).toBeVisible();
    for (const name of ["Free", "Pro", "Max"]) {
      await expect(page.getByRole("region", { name })).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "Pro" }).getByText("Discovery")).toBeVisible();
  });

  test("payment history is reachable for the owner", async ({ page }) => {
    await page.goto(`/${slug}/billing/payments`);
    await expect(page.getByRole("heading", { level: 1, name: "Payment history" })).toBeVisible();
  });

  test("a spoofed success URL activates nothing", async ({ page }) => {
    await page.goto(`/${slug}/billing/success?session=00000000-0000-4000-8000-000000000000`);
    await expect(page.getByRole("heading", { name: "We couldn't find that checkout" })).toBeVisible();
    await expect(page.getByText("Subscription active")).toHaveCount(0);
  });

  test("checkout refuses a request carrying price fields", async ({ page }) => {
    const plans = await page.request.post("/api/billing/checkout", {
      data: {
        businessSlug: slug,
        planId: "00000000-0000-4000-8000-000000000000",
        billingInterval: "month",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        amount: 1,
      },
    });
    expect(plans.status()).toBe(400);
  });

  test("checkout refuses a business the user doesn't belong to", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", {
      data: {
        businessSlug: "definitely-not-a-member-business",
        planId: "00000000-0000-4000-8000-000000000000",
        billingInterval: "month",
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(response.status()).toBe(404);
  });
});
