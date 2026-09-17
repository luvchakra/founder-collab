/**
 * Resend delivery-status webhook. The Svix signature check here is hand-rolled (rather
 * than pulling in the svix package for one verification, per CLAUDE.md principle #2),
 * which makes it exactly the kind of code that needs tests: a hand-rolled HMAC check that
 * silently accepts everything is indistinguishable from a working one until someone
 * forges a payload.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ingestSendStatus } = vi.hoisted(() => ({ ingestSendStatus: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/messages/ingest-send-status", () => ({
  ingestSendStatus,
}));

const { POST } = await import("./route");

const SECRET_BYTES = Buffer.from("super-secret-signing-key-0123456789");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
const SVIX_ID = "msg_2abc";
const TIMESTAMP = "1789000000";

function sign(rawBody: string, secret = SECRET_BYTES): string {
  const digest = createHmac("sha256", secret).update(`${SVIX_ID}.${TIMESTAMP}.${rawBody}`).digest();
  return `v1,${digest.toString("base64")}`;
}

function request(
  payload: unknown,
  options: { signature?: string; omitHeaders?: string[] } = {},
) {
  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "svix-id": SVIX_ID,
    "svix-timestamp": TIMESTAMP,
    "svix-signature": options.signature ?? sign(rawBody),
  };
  for (const header of options.omitHeaders ?? []) delete headers[header];

  return new Request("https://example.com/api/webhooks/email-status", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

const BOUNCE = {
  type: "email.bounced",
  data: { email_id: "resend-123", bounce: { message: "mailbox full" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  ingestSendStatus.mockResolvedValue({ matched: true, message: { id: "m1" } });
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/email-status", () => {
  it("accepts a correctly signed bounce and strips the 'email.' prefix from the status", async () => {
    const response = await POST(request(BOUNCE));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ matched: true, messageId: "m1" });
    expect(ingestSendStatus).toHaveBeenCalledWith({
      providerMessageId: "resend-123",
      status: "bounced",
      reason: "mailbox full",
    });
  });

  it("falls back to data.reason when there is no bounce message", async () => {
    await POST(request({ type: "email.failed", data: { email_id: "r1", reason: "rejected" } }));

    expect(ingestSendStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", reason: "rejected" }),
    );
  });

  it("passes a null reason when the payload carries neither", async () => {
    await POST(request({ type: "email.delivered", data: { email_id: "r1" } }));

    expect(ingestSendStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", reason: null }),
    );
  });

  it("accepts a signature header carrying several space-separated versions", async () => {
    const rawBody = JSON.stringify(BOUNCE);
    const response = await POST(
      request(BOUNCE, { signature: `v1,${"A".repeat(44)} ${sign(rawBody)}` }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const rawBody = JSON.stringify(BOUNCE);
    const forged = sign(rawBody, Buffer.from("attacker-key"));

    const response = await POST(request(BOUNCE, { signature: forged }));

    expect(response.status).toBe(401);
    expect(ingestSendStatus).not.toHaveBeenCalled();
  });

  it("rejects a signature that is valid for a different body (no replay onto new content)", async () => {
    const signatureForOtherBody = sign(JSON.stringify({ type: "email.delivered", data: {} }));

    const response = await POST(request(BOUNCE, { signature: signatureForOtherBody }));

    expect(response.status).toBe(401);
    expect(ingestSendStatus).not.toHaveBeenCalled();
  });

  it.each([["svix-id"], ["svix-timestamp"], ["svix-signature"]])(
    "rejects a request missing the %s header",
    async (header) => {
      const response = await POST(request(BOUNCE, { omitHeaders: [header] }));

      expect(response.status).toBe(401);
      expect(ingestSendStatus).not.toHaveBeenCalled();
    },
  );

  it("rejects a malformed signature header with no comma-separated signature part", async () => {
    const response = await POST(request(BOUNCE, { signature: "v1" }));

    expect(response.status).toBe(401);
  });

  it("denies everything when RESEND_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");

    expect((await POST(request(BOUNCE))).status).toBe(401);
    expect(ingestSendStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["no email_id", { type: "email.bounced", data: {} }],
    ["no type", { data: { email_id: "r1" } }],
  ])("returns 400 for an authenticated payload with %s", async (_label, payload) => {
    const response = await POST(request(payload));

    expect(response.status).toBe(400);
    expect(ingestSendStatus).not.toHaveBeenCalled();
  });

  it("returns 200 for an unmatched message, so Resend stops retrying", async () => {
    ingestSendStatus.mockResolvedValue({ matched: false, reason: "unknown_provider_message" });

    const response = await POST(request(BOUNCE));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      matched: false,
      reason: "unknown_provider_message",
    });
  });
});
