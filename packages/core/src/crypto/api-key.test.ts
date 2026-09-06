import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, fingerprintApiKey } from "./api-key";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

describe("encryptApiKey / decryptApiKey", () => {
  it("round-trips a plaintext key", () => {
    const plaintext = "sk-test-1234567890abcdef";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "sk-test-1234567890abcdef";
    expect(encryptApiKey(plaintext)).not.toBe(encryptApiKey(plaintext));
  });

  it("throws if the encryption secret is missing", () => {
    const saved = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    expect(() => encryptApiKey("x")).toThrow("API_KEY_ENCRYPTION_SECRET is not configured");
    process.env.API_KEY_ENCRYPTION_SECRET = saved;
  });

  it("throws if the encryption secret isn't exactly 32 bytes", () => {
    const saved = process.env.API_KEY_ENCRYPTION_SECRET;
    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.from("too-short").toString("base64");
    expect(() => encryptApiKey("x")).toThrow("must decode to exactly 32 bytes");
    process.env.API_KEY_ENCRYPTION_SECRET = saved;
  });
});

describe("fingerprintApiKey", () => {
  it("is deterministic", () => {
    expect(fingerprintApiKey("sk-abc")).toBe(fingerprintApiKey("sk-abc"));
  });

  it("differs for different inputs", () => {
    expect(fingerprintApiKey("sk-abc")).not.toBe(fingerprintApiKey("sk-def"));
  });

  it("never reveals the plaintext", () => {
    expect(fingerprintApiKey("sk-super-secret")).not.toContain("sk-super-secret");
  });
});
