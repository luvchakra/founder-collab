import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";
import { bearerTokenMatches, hmacSha256HexMatches, secretsEqual } from "./timing-safe";
import { validatePassword } from "./password-policy";
import { buildContentSecurityPolicy } from "./headers";

describe("safeRedirectPath", () => {
  it("passes through a plain same-origin path", () => {
    expect(safeRedirectPath("/onboarding", "/dashboard")).toBe("/onboarding");
    expect(safeRedirectPath("/dashboard/settings?tab=1", "/dashboard")).toBe("/dashboard/settings?tab=1");
  });

  it.each([
    ["@evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["javascript:alert(1)"],
    [""],
  ])("rejects %j", (candidate) => {
    expect(safeRedirectPath(candidate, "/dashboard")).toBe("/dashboard");
  });

  it("falls back on null/undefined", () => {
    expect(safeRedirectPath(null, "/x")).toBe("/x");
    expect(safeRedirectPath(undefined, "/x")).toBe("/x");
  });
});

describe("secretsEqual / bearerTokenMatches", () => {
  it("matches identical secrets and rejects different ones", () => {
    expect(secretsEqual("s3cret", "s3cret")).toBe(true);
    expect(secretsEqual("s3cret", "s3cre")).toBe(false);
    expect(secretsEqual("s3cret", "S3cret")).toBe(false);
  });

  it("never matches when either side is missing", () => {
    expect(secretsEqual(undefined, "x")).toBe(false);
    expect(secretsEqual("x", undefined)).toBe(false);
    expect(secretsEqual("", "")).toBe(false);
  });

  it("checks the bearer scheme", () => {
    expect(bearerTokenMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerTokenMatches("abc", "abc")).toBe(false);
    expect(bearerTokenMatches("Bearer abc", undefined)).toBe(false);
    expect(bearerTokenMatches(null, "abc")).toBe(false);
  });
});

describe("hmacSha256HexMatches", () => {
  const sig = createHmac("sha256", "key").update("body").digest("hex");
  it("accepts a correct signature", () => {
    expect(hmacSha256HexMatches("body", "key", sig)).toBe(true);
  });
  it("rejects a wrong, truncated, or non-hex signature", () => {
    expect(hmacSha256HexMatches("body!", "key", sig)).toBe(false);
    expect(hmacSha256HexMatches("body", "key", sig.slice(0, 10))).toBe(false);
    expect(hmacSha256HexMatches("body", "key", "zz")).toBe(false);
    expect(hmacSha256HexMatches("body", "key", null)).toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts a long, unremarkable passphrase", () => {
    expect(validatePassword("correct horse battery")).toBeNull();
  });
  it("rejects short passwords", () => {
    expect(validatePassword("short1!")).toMatch(/at least 12/);
  });
  it("rejects passwords past bcrypt's 72-byte limit", () => {
    expect(validatePassword("a".repeat(60) + "é".repeat(10))).toMatch(/72 bytes/);
  });
  it("rejects common and repeated-character passwords", () => {
    expect(validatePassword("Password1234")).toMatch(/too common/);
    expect(validatePassword("aaaaaaaaaaaaaa")).toMatch(/too common/);
  });
  it("rejects passwords containing the email's local part", () => {
    expect(validatePassword("kunal-is-great-2026", { email: "kunal@example.com" })).toMatch(/email/);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("includes the nonce and strict-dynamic, blocks framing and plugins", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", isDev: false, supabaseUrl: "https://x.supabase.co" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows eval only in development", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
