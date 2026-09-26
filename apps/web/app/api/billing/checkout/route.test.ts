/**
 * BILL-37 (§88, checkout tampering): the browser names a plan and nothing that decides
 * the charge. A body carrying amount/currency/providerPriceId/modules is rejected
 * outright, and the business comes from an RLS-scoped slug lookup, never a raw id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveBusinessIdBySlug: vi.fn(), startCheckout: vi.fn(), getUser: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@cofounderai/core/businesses/resolve", () => ({ resolveBusinessIdBySlug: mocks.resolveBusinessIdBySlug }));
vi.mock("@cofounderai/core/billing/checkout", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startCheckout: mocks.startCheckout,
}));

const { POST } = await import("./route");
const { CheckoutError } = await import("@cofounderai/core/billing/checkout");
const { BillingAccessError } = await import("@cofounderai/core/billing/access");

const valid = {
  businessSlug: "acme",
  planId: "40246aaa-d671-47d5-a530-e7978a9da924",
  billingInterval: "month",
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
};
const post = (body: unknown) => POST(new Request("https://example.com/api/billing/checkout", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.resolveBusinessIdBySlug.mockResolvedValue("biz-1");
  mocks.startCheckout.mockResolvedValue({ provider: "stripe", mode: "redirect", url: "https://checkout.stripe.com/x", sessionId: "s1" });
});

describe("POST /api/billing/checkout", () => {
  it("starts checkout from the plan alone", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(mocks.startCheckout).toHaveBeenCalledWith({ businessId: "biz-1", ...valid });
  });

  it.each([["amount", 1], ["currency", "USD"], ["providerPriceId", "price_cheap"], ["modules", ["gst"]], ["businessId", "biz-2"]])(
    "rejects a body that also carries %s",
    async (field, value) => {
      const res = await post({ ...valid, [field]: value });
      expect(res.status).toBe(400);
      expect(mocks.startCheckout).not.toHaveBeenCalled();
    },
  );

  it("401s a signed-out caller before any lookup", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await post(valid)).status).toBe(401);
    expect(mocks.resolveBusinessIdBySlug).not.toHaveBeenCalled();
  });

  it("404s a business the caller can't see", async () => {
    mocks.resolveBusinessIdBySlug.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it("403s a member who isn't an account owner or admin", async () => {
    mocks.startCheckout.mockRejectedValue(new BillingAccessError());
    expect((await post(valid)).status).toBe(403);
  });

  it("409s a second subscription, and never leaks provider detail on a provider failure", async () => {
    mocks.startCheckout.mockRejectedValueOnce(new CheckoutError("already_subscribed", "You already have an active subscription."));
    expect((await post(valid)).status).toBe(409);
    mocks.startCheckout.mockRejectedValueOnce(new Error("Stripe said: sk_live_secret invalid"));
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("sk_live");
  });
});
