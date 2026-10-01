import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";
import { emailHash } from "./suppression";

const BUSINESS = "3f1c2a6e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

describe("emailHash", () => {
  it("normalizes case and surrounding whitespace, matching core.email_hash()", () => {
    expect(emailHash("  Alice@Example.COM ")).toBe(emailHash("alice@example.com"));
    // sha256("alice@example.com") -- the same value Postgres computes in core.email_hash().
    expect(emailHash("alice@example.com")).toBe("ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976");
  });
});

describe("unsubscribe tokens", () => {
  const hash = emailHash("alice@example.com");

  it("round-trips the business and email hash, never the address", () => {
    const token = createUnsubscribeToken(BUSINESS, hash);
    expect(token).not.toContain("alice");
    expect(verifyUnsubscribeToken(token)).toEqual({ businessId: BUSINESS, emailHash: hash });
  });

  it("rejects a token re-targeted at another business or address", () => {
    const [, , sig] = createUnsubscribeToken(BUSINESS, hash).split(".");
    const otherBusiness = "00000000-0000-4000-8000-000000000000";
    expect(verifyUnsubscribeToken(`${otherBusiness}.${hash}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${BUSINESS}.${emailHash("bob@example.com")}.${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
    expect(verifyUnsubscribeToken(`${BUSINESS}.${hash}`)).toBeNull();
  });

  it("stops verifying when the signing secret rotates", () => {
    const token = createUnsubscribeToken(BUSINESS, hash);
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});
