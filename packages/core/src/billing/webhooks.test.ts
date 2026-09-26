import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type RecordedQuery } from "../test-support/fake-supabase";
import type { ProviderConfig } from "./subscription-types";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
const providerConfig = vi.hoisted(() => ({ loadProviderConfig: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("./provider-config", async (importOriginal) => ({ ...(await importOriginal<object>()), ...providerConfig }));

const { ingestWebhook, processBillingEvent } = await import("./webhooks");

const SECRET = "rzp_wh_secret";
const config: ProviderConfig = {
  provider: "razorpay",
  environment: "test",
  enabled: true,
  priority: 10,
  supportedCurrencies: ["INR"],
  supportedCountries: [],
  publicKey: "rzp_test_k",
  secretKey: "sk",
  webhookSecret: SECRET,
  source: "platform",
};
const body = JSON.stringify({ event: "order.paid", created_at: 1_800_000_000, payload: {} });
const signed = (b: string) => new Headers({ "x-razorpay-signature": createHmac("sha256", SECRET).update(b).digest("hex"), "x-razorpay-event-id": "evt_1" });

afterEach(() => vi.clearAllMocks());

function wire(insertedRows: unknown[]) {
  const fake = createFakeSupabase({
    query: (call: RecordedQuery) => (call.table === "billing_events" ? { data: insertedRows, error: null } : { data: null, error: null }),
  });
  createAdminClient.mockReturnValue(fake);
  providerConfig.loadProviderConfig.mockResolvedValue(config);
  return fake;
}

describe("BILL-12/14 ingestWebhook", () => {
  it("persists a verified event once, keyed by provider event id", async () => {
    const fake = wire([{ id: "row-1" }]);
    expect(await ingestWebhook("razorpay", body, signed(body))).toEqual({ status: 200, eventId: "row-1", duplicate: false });
    const upsert = fake.queries("billing_events")[0]!;
    const [row, options] = upsert.ops.find((o) => o.method === "upsert")!.args as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toMatchObject({ provider: "razorpay", environment: "test", provider_event_id: "evt_1", event_type: "order.paid" });
    expect(options).toMatchObject({ onConflict: "provider,environment,provider_event_id", ignoreDuplicates: true });
  });

  it("treats a redelivery as a no-op success (duplicate webhook, §86)", async () => {
    wire([]);
    expect(await ingestWebhook("razorpay", body, signed(body))).toEqual({ status: 200, eventId: null, duplicate: true });
  });

  it("rejects a bad signature without writing any billing state", async () => {
    const fake = wire([{ id: "row-1" }]);
    const result = await ingestWebhook("razorpay", body, new Headers({ "x-razorpay-signature": "0".repeat(64) }));
    expect(result.status).toBe(401);
    expect(fake.queries("billing_events")).toHaveLength(0);
    expect(fake.queries().every((q) => q.table === "billing_providers")).toBe(true);
  });

  it("answers 503 when the provider has no webhook secret", async () => {
    wire([]);
    providerConfig.loadProviderConfig.mockResolvedValue({ ...config, webhookSecret: null });
    expect((await ingestWebhook("razorpay", body, signed(body))).status).toBe(503);
  });
});

describe("BILL-14 processBillingEvent", () => {
  it("skips an event that is already processed", async () => {
    const fake = createFakeSupabase({
      query: () => ({ data: { id: "row-1", provider: "razorpay", environment: "test", provider_event_id: "evt_1", event_type: "order.paid", processing_status: "processed", attempt_count: 1, payload: {} }, error: null }),
    });
    createAdminClient.mockReturnValue(fake);
    expect(await processBillingEvent("row-1")).toBe("skipped");
    expect(fake.queries("billing_events").some((q) => q.ops.some((o) => o.method === "update"))).toBe(false);
  });

  it("records an event it doesn't act on as unhandled", async () => {
    const fake = createFakeSupabase({
      query: (call) =>
        call.ops.some((o) => o.method === "single")
          ? { data: { id: "row-1", provider: "razorpay", environment: "test", provider_event_id: "evt_1", event_type: "order.paid", processing_status: "received", attempt_count: 0, payload: JSON.parse(body) }, error: null }
          : { data: [{ id: "row-1" }], error: null },
    });
    createAdminClient.mockReturnValue(fake);
    expect(await processBillingEvent("row-1")).toBe("unhandled");
  });

  it("loses the claim race gracefully when another worker took the attempt", async () => {
    const fake = createFakeSupabase({
      query: (call) =>
        call.ops.some((o) => o.method === "single")
          ? { data: { id: "row-1", provider: "razorpay", environment: "test", provider_event_id: "evt_1", event_type: "subscription.charged", processing_status: "failed", attempt_count: 2, payload: {} }, error: null }
          : { data: [], error: null },
    });
    createAdminClient.mockReturnValue(fake);
    expect(await processBillingEvent("row-1")).toBe("skipped");
  });
});
