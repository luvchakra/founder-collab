import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { encryptApiKey } from "../crypto/api-key";
import { environmentOfKey, resolveProviderConfig, selectProvider } from "./provider-config";
import type { ProviderConfig } from "./subscription-types";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

const row = (over: Partial<Parameters<typeof resolveProviderConfig>[0]> = {}) => ({
  provider: "razorpay" as const,
  enabled: true,
  environment: "test" as const,
  priority: 10,
  supported_currencies: ["inr"],
  supported_countries: [],
  public_key: "rzp_test_pub",
  encrypted_secret_key: null,
  encrypted_webhook_secret: null,
  ...over,
});

describe("BILL-06 provider config resolution", () => {
  it("reads test/live from key prefixes", () => {
    expect(environmentOfKey("razorpay", "rzp_live_abc")).toBe("live");
    expect(environmentOfKey("razorpay", "rzp_test_abc")).toBe("test");
    expect(environmentOfKey("stripe", "sk_live_abc")).toBe("live");
    expect(environmentOfKey("stripe", "rk_test_abc")).toBe("test");
    expect(environmentOfKey("stripe", "whatever")).toBeNull();
  });

  it("prefers the portal's encrypted secrets", () => {
    const c = resolveProviderConfig(row({ encrypted_secret_key: encryptApiKey("portal-secret"), encrypted_webhook_secret: encryptApiKey("portal-wh") }), {
      RAZORPAY_KEY_SECRET: "rzp_test_envsecret",
    });
    expect(c).toMatchObject({ secretKey: "portal-secret", webhookSecret: "portal-wh", source: "platform", supportedCurrencies: ["INR"] });
  });

  it("falls back to env vars only when their prefix matches the selected environment", () => {
    const env = { RAZORPAY_KEY_ID: "rzp_test_envpub", RAZORPAY_KEY_SECRET: "rzp_test_envsecret", RAZORPAY_WEBHOOK_SECRET: "wh" };
    const test = resolveProviderConfig(row({ public_key: null }), env);
    expect(test).toMatchObject({ secretKey: "rzp_test_envsecret", publicKey: "rzp_test_envpub", webhookSecret: "wh", source: "env" });
    const live = resolveProviderConfig(row({ environment: "live" }), env);
    expect(live.secretKey).toBeNull();
    expect(live.webhookSecret).toBeNull();
  });

  it("treats an undecryptable secret as unconfigured rather than throwing", () => {
    expect(resolveProviderConfig(row({ encrypted_secret_key: "not-ciphertext" }), {}).secretKey).toBeNull();
  });

  it("never lets an env var switch a disabled provider on", () => {
    expect(resolveProviderConfig(row({ enabled: false }), { RAZORPAY_KEY_SECRET: "rzp_test_x" }).enabled).toBe(false);
  });
});

describe("BILL-06 provider routing", () => {
  const cfg = (over: Partial<ProviderConfig>): ProviderConfig => ({
    provider: "razorpay",
    environment: "test",
    enabled: true,
    priority: 10,
    supportedCurrencies: ["INR"],
    supportedCountries: [],
    publicKey: "pk",
    secretKey: "sk",
    webhookSecret: "wh",
    source: "platform",
    ...over,
  });
  const razorpay = cfg({});
  const stripe = cfg({ provider: "stripe", priority: 20, supportedCurrencies: ["USD", "INR"] });

  it("routes by currency, then priority", () => {
    expect(selectProvider([stripe, razorpay], { currency: "inr", country: "IN" })?.provider).toBe("razorpay");
    expect(selectProvider([stripe, razorpay], { currency: "USD", country: "US" })?.provider).toBe("stripe");
  });

  it("skips disabled or unconfigured providers and falls to the next", () => {
    expect(selectProvider([stripe, { ...razorpay, enabled: false }], { currency: "INR", country: "IN" })?.provider).toBe("stripe");
    expect(selectProvider([stripe, { ...razorpay, secretKey: null }], { currency: "INR", country: "IN" })?.provider).toBe("stripe");
  });

  it("honours a country allow-list", () => {
    const indiaOnly = { ...razorpay, supportedCountries: ["IN"] };
    expect(selectProvider([indiaOnly], { currency: "INR", country: "US" })).toBeNull();
    expect(selectProvider([indiaOnly], { currency: "INR", country: null })).toBeNull();
    expect(selectProvider([indiaOnly], { currency: "INR", country: "in" })?.provider).toBe("razorpay");
  });

  it("returns null when nothing takes the currency -- never a mismatched fallback", () => {
    expect(selectProvider([stripe, razorpay], { currency: "JPY", country: "JP" })).toBeNull();
  });
});
