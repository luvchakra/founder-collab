import { describe, expect, it } from "vitest";
import { bearerTokenMatches, secretsEqual } from "./timing-safe";

describe("secretsEqual (SEC-3)", () => {
  it("matches identical secrets", () => {
    expect(secretsEqual("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a different secret, a prefix of it, and a case change", () => {
    expect(secretsEqual("s3cret-valuX", "s3cret-value")).toBe(false);
    expect(secretsEqual("s3cret", "s3cret-value")).toBe(false);
    expect(secretsEqual("S3CRET-VALUE", "s3cret-value")).toBe(false);
  });

  it("never matches when either side is missing or empty -- an unconfigured route stays locked", () => {
    expect(secretsEqual(undefined, "x")).toBe(false);
    expect(secretsEqual("x", undefined)).toBe(false);
    expect(secretsEqual(null, null)).toBe(false);
    expect(secretsEqual("", "")).toBe(false);
  });
});

describe("bearerTokenMatches (SEC-3)", () => {
  it("accepts the right bearer token", () => {
    expect(bearerTokenMatches("Bearer abc123", "abc123")).toBe(true);
  });

  it("rejects a missing scheme, a wrong token, or an unset CRON_SECRET", () => {
    expect(bearerTokenMatches("abc123", "abc123")).toBe(false);
    expect(bearerTokenMatches("Basic abc123", "abc123")).toBe(false);
    expect(bearerTokenMatches("Bearer abc124", "abc123")).toBe(false);
    expect(bearerTokenMatches("Bearer ", "")).toBe(false);
    expect(bearerTokenMatches("Bearer abc123", undefined)).toBe(false);
    expect(bearerTokenMatches(null, "abc123")).toBe(false);
  });
});
