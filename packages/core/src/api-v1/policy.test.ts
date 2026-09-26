import { describe, expect, it } from "vitest";
import { DEFAULT_API_POLICY, exceedsPayloadLimit, requestBodyBytes, toApiPolicy } from "./policy";
import { verifyStripeSignature } from "../billing/providers/stripe";
import { createHmac } from "node:crypto";

/** PLATFORM-P1-06.1 / 06.3 -- the API and webhook policy the request paths enforce. */
describe("API policy", () => {
  it("reads the per-minute limit from system policies and the rest from api_policies", () => {
    const policy = toApiPolicy({ burst_limit_per_second: 5, max_payload_kb: 64, webhook_max_retries: 3 }, { rate_limit_api_per_minute: 600 });
    expect(policy).toMatchObject({ rateLimitPerMinute: 600, burstLimitPerSecond: 5, maxPayloadKb: 64, webhookMaxRetries: 3 });
    expect(policy.webhookTimeoutSeconds).toBe(DEFAULT_API_POLICY.webhookTimeoutSeconds);
  });

  it("falls back to today's defaults when nothing is configured", () => {
    expect(toApiPolicy(null, null)).toEqual(DEFAULT_API_POLICY);
  });

  it("rejects a body over the payload limit", () => {
    expect(exceedsPayloadLimit(1024 * 64, 64)).toBe(false);
    expect(exceedsPayloadLimit(1024 * 64 + 1, 64)).toBe(true);
  });

  it("measures a body without a Content-Length header", async () => {
    const request = new Request("https://example.test/api/v1/products", { method: "POST", body: "x".repeat(2048) });
    request.headers.delete("content-length");
    expect(await requestBodyBytes(request)).toBe(2048);
    expect(await requestBodyBytes(new Request("https://example.test/api/v1/products"))).toBe(0);
  });

  it("uses the configured signature tolerance as the webhook replay window", () => {
    const secret = "whsec_policy";
    const body = "{}";
    const t = 1_000_000;
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    const header = `t=${t},v1=${sig}`;
    expect(() => verifyStripeSignature(body, header, secret, t + 200, 300)).not.toThrow();
    expect(() => verifyStripeSignature(body, header, secret, t + 200, 60)).toThrow(/Stale/);
  });
});
