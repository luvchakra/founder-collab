import { expect, test } from "@playwright/test";

/**
 * BILL-37 (§86, §89) -- the billing endpoints sit under /api, outside the proxy's session
 * gate, so each must refuse on its own: an unsigned webhook changes nothing, and a
 * signed-out checkout is refused. No response may echo a secret.
 */
test.describe("Billing endpoints (signed out)", () => {
  for (const provider of ["razorpay", "stripe"]) {
    test(`an unsigned ${provider} webhook is refused`, async ({ request }) => {
      const response = await request.post(`/api/webhooks/billing/${provider}`, {
        data: { event: "subscription.activated", type: "customer.subscription.updated", id: "evt_spoof" },
        maxRedirects: 0,
      });
      // 401 once the provider is configured; 503 while it has no webhook secret yet.
      expect([401, 503]).toContain(response.status());
      const text = await response.text();
      expect(text).not.toMatch(/sk_(live|test)_|rzp_(live|test)_|whsec_/);
    });
  }

  test("a signed-out checkout is refused", async ({ request }) => {
    const response = await request.post("/api/billing/checkout", {
      data: {
        businessSlug: "any",
        planId: "00000000-0000-4000-8000-000000000000",
        billingInterval: "month",
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
      },
      maxRedirects: 0,
    });
    expect([401, 403, 404]).toContain(response.status());
  });

  test("the billing cron refuses without the shared secret", async ({ request }) => {
    const response = await request.get("/api/cron/billing", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
  });
});
