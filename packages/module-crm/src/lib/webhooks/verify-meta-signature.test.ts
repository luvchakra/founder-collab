import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature, verifyMetaSubscription } from "./verify-meta-signature";

const SECRET = "test-app-secret";

function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body that doesn't match the signature (payload tampered after signing)", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const signature = sign(body);
    const tampered = JSON.stringify({ object: "page", entry: [{ id: "injected" }] });
    expect(verifyMetaSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyMetaSignature("{}", null, SECRET)).toBe(false);
  });

  it("rejects a header with the wrong scheme", () => {
    const body = "{}";
    const hex = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyMetaSignature(body, `sha1=${hex}`, SECRET)).toBe(false);
  });

  it("rejects a malformed header with no '=' separator", () => {
    expect(verifyMetaSignature("{}", "not-a-valid-header", SECRET)).toBe(false);
  });
});

describe("verifyMetaSubscription", () => {
  it("returns the challenge on a matching subscribe request", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "correct-token",
      "hub.challenge": "12345",
    });
    expect(verifyMetaSubscription(params, "correct-token")).toEqual({ ok: true, challenge: "12345" });
  });

  it("rejects a mismatched verify token", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "12345",
    });
    expect(verifyMetaSubscription(params, "correct-token")).toEqual({ ok: false });
  });

  it("rejects a non-subscribe mode", () => {
    const params = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "correct-token",
      "hub.challenge": "12345",
    });
    expect(verifyMetaSubscription(params, "correct-token")).toEqual({ ok: false });
  });
});
