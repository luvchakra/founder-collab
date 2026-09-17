/**
 * Inbound-email webhook: shared-secret auth plus the deliberate "unmatched sender is a
 * 200, not an error" contract — returning an error there would make most providers retry
 * an unmatchable email forever, so it is worth a regression test rather than a comment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ingestInboundEmail } = vi.hoisted(() => ({ ingestInboundEmail: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/conversations/ingest-inbound-email", () => ({
  ingestInboundEmail,
}));

const { POST } = await import("./route");

const SECRET = "inbound-secret";
const VALID_BODY = { from: "prospect@example.com", subject: "Re: hello", text: "Sounds good" };

function request(body: unknown, secret: string | null = SECRET) {
  return new Request("https://example.com/api/webhooks/email-inbound", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { "x-webhook-secret": secret }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ingestInboundEmail.mockResolvedValue({ matched: true, message: { id: "m1" } });
  vi.stubEnv("EMAIL_INBOUND_WEBHOOK_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/email-inbound", () => {
  it("ingests a well-formed authenticated payload", async () => {
    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ matched: true, messageId: "m1" });
    expect(ingestInboundEmail).toHaveBeenCalledWith({
      from: "prospect@example.com",
      subject: "Re: hello",
      text: "Sounds good",
    });
  });

  it("normalizes a missing or non-string subject to null", async () => {
    await POST(request({ from: "a@example.com", text: "hi" }));
    expect(ingestInboundEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: null }));

    ingestInboundEmail.mockClear();
    await POST(request({ from: "a@example.com", text: "hi", subject: 42 }));
    expect(ingestInboundEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: null }));
  });

  it.each([
    ["a missing secret header", null],
    ["a wrong secret", "wrong-secret"],
  ])("rejects %s without ingesting anything", async (_label, secret) => {
    const response = await POST(request(VALID_BODY, secret));

    expect(response.status).toBe(401);
    expect(ingestInboundEmail).not.toHaveBeenCalled();
  });

  it("denies everything when the secret is unset rather than accepting anonymous posts", async () => {
    vi.stubEnv("EMAIL_INBOUND_WEBHOOK_SECRET", "");

    expect((await POST(request(VALID_BODY, ""))).status).toBe(401);
    expect(ingestInboundEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a missing 'from'", { text: "hi" }],
    ["a missing 'text'", { from: "a@example.com" }],
    ["a non-string 'from'", { from: 1, text: "hi" }],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(ingestInboundEmail).not.toHaveBeenCalled();
  });

  it("returns 200 with the reason for an unmatched sender, so the provider stops retrying", async () => {
    ingestInboundEmail.mockResolvedValue({ matched: false, reason: "no_prospect_for_sender" });

    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      matched: false,
      reason: "no_prospect_for_sender",
    });
  });
});
