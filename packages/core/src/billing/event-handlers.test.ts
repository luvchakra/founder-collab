import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type RecordedQuery } from "../test-support/fake-supabase";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { sendBillingEmail } = await import("./event-handlers");
const { getEventHandlers } = await import("../events/registry");
const { BILLING_NOTIFICATION_TYPES } = await import("./notifications");

const event = (type: string, payload: Record<string, unknown> = {}) =>
  ({ id: "evt-1", business_id: "biz-1", type, payload, required_module: null, status: "pending", attempts: 0, max_attempts: 5, next_attempt_at: "", last_error: null, published_at: "", processed_at: null }) as never;

function wire() {
  const fake = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "businesses") return { data: { name: "Acme", account_id: "acc-1" }, error: null };
      if (call.table === "account_members") return { data: [{ user_id: "u-owner" }], error: null };
      if (call.table === "business_settings") return { data: { slug: "acme" }, error: null };
      return { data: null, error: null };
    },
  }) as unknown as Record<string, unknown>;
  fake.auth = { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "owner@example.com" } } }) } };
  createAdminClient.mockReturnValue(fake);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BILL-35 billing emails", () => {
  it("registers a handler for every billing notification, so none fails the drain", () => {
    for (const type of BILLING_NOTIFICATION_TYPES) expect(getEventHandlers(type).length).toBeGreaterThan(0);
  });

  it("does nothing when email isn't configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBillingEmail(event("billing.payment_failed"))).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails the account's owners and admins with a link to the business's billing page", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "billing@example.com");
    wire();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBillingEmail(event("billing.payment_failed", { amount: "₹2,999.00" }))).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.subject).toBe("Payment needs attention");
    expect(body.text).toContain("/acme/billing");
    expect(init.headers["Idempotency-Key"]).toBe("billing-evt-1");
  });
});
