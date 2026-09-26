import { createAdminClient } from "../db/admin";
import { decryptApiKey } from "../crypto/api-key";
import { createRazorpayProvider } from "./providers/razorpay";
import { createStripeProvider } from "./providers/stripe";
import type { BillingEnvironment, BillingProvider, BillingProviderKey, ProviderConfig } from "./subscription-types";

/**
 * BILL-06 -- where a provider's credentials come from, and which provider takes a
 * given checkout (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §15, §40-§43, §57).
 *
 * Server-only: this reads platform.billing_providers with the service role (the table has
 * no authenticated grant at all) and decrypts secrets in memory. Nothing returned from here
 * may be handed to a browser except `publicKey`.
 *
 * Secrets come from the admin portal first. The deployment's env vars are a fallback so a
 * deploy that already carries RAZORPAY_KEY_ID/_SECRET (the AI-credit top-up uses them)
 * keeps working before anyone opens the portal -- but only when the key's own test/live
 * prefix matches the environment the portal has selected (§42: never mix test and live).
 * `enabled`, priority and routing are always the portal's -- an env var never switches a
 * provider on.
 */

type BillingProviderRow = {
  provider: BillingProviderKey;
  enabled: boolean;
  environment: BillingEnvironment;
  priority: number;
  supported_currencies: string[] | null;
  supported_countries: string[] | null;
  public_key: string | null;
  encrypted_secret_key: string | null;
  encrypted_webhook_secret: string | null;
};

const ENV_KEYS: Record<BillingProviderKey, { publicKey: string; secretKey: string; webhookSecret: string }> = {
  razorpay: { publicKey: "RAZORPAY_KEY_ID", secretKey: "RAZORPAY_KEY_SECRET", webhookSecret: "RAZORPAY_WEBHOOK_SECRET" },
  stripe: { publicKey: "STRIPE_PUBLISHABLE_KEY", secretKey: "STRIPE_SECRET_KEY", webhookSecret: "STRIPE_WEBHOOK_SECRET" },
};

/** The environment a key belongs to, from the prefix both providers put on it; null when
 * the prefix is not one we recognise. */
export function environmentOfKey(provider: BillingProviderKey, key: string): BillingEnvironment | null {
  if (provider === "razorpay") {
    if (key.startsWith("rzp_live_")) return "live";
    if (key.startsWith("rzp_test_")) return "test";
    return null;
  }
  if (/^(sk|rk|pk)_live_/.test(key)) return "live";
  if (/^(sk|rk|pk)_test_/.test(key)) return "test";
  return null;
}

function decryptOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptApiKey(value);
  } catch {
    // A secret encrypted under a rotated API_KEY_ENCRYPTION_SECRET is unusable, not fatal:
    // the provider reads as unconfigured and the admin page says so.
    return null;
  }
}

/** Builds one provider's effective config from its row and the environment variables. */
export function resolveProviderConfig(row: BillingProviderRow, env: Record<string, string | undefined> = process.env): ProviderConfig {
  const base = {
    provider: row.provider,
    environment: row.environment,
    enabled: row.enabled,
    priority: row.priority,
    supportedCurrencies: (row.supported_currencies ?? []).map((c) => c.toUpperCase()),
    supportedCountries: (row.supported_countries ?? []).map((c) => c.toUpperCase()),
  };

  const secretKey = decryptOrNull(row.encrypted_secret_key);
  if (secretKey) {
    return {
      ...base,
      publicKey: row.public_key,
      secretKey,
      webhookSecret: decryptOrNull(row.encrypted_webhook_secret),
      source: "platform",
    };
  }

  const names = ENV_KEYS[row.provider];
  const envSecret = env[names.secretKey];
  if (envSecret && environmentOfKey(row.provider, envSecret) === row.environment) {
    return {
      ...base,
      publicKey: row.public_key ?? env[names.publicKey] ?? null,
      secretKey: envSecret,
      webhookSecret: decryptOrNull(row.encrypted_webhook_secret) ?? env[names.webhookSecret] ?? null,
      source: "env",
    };
  }

  return { ...base, publicKey: row.public_key, secretKey: null, webhookSecret: null, source: "platform" };
}

export async function loadProviderConfigs(): Promise<ProviderConfig[]> {
  const admin = createAdminClient({ schema: "platform" });
  const { data, error } = await admin
    .from("billing_providers")
    .select("provider, enabled, environment, priority, supported_currencies, supported_countries, public_key, encrypted_secret_key, encrypted_webhook_secret");
  if (error) throw error;
  return ((data ?? []) as BillingProviderRow[]).map((row) => resolveProviderConfig(row));
}

export async function loadProviderConfig(provider: BillingProviderKey): Promise<ProviderConfig | null> {
  return (await loadProviderConfigs()).find((c) => c.provider === provider) ?? null;
}

/** Usable for a new checkout: switched on and holding the credentials checkout needs. */
export function isCheckoutReady(config: ProviderConfig): boolean {
  return config.enabled && !!config.secretKey && !!config.publicKey;
}

/**
 * BILL-06 -- picks the provider for a checkout (§15, §57): enabled and configured, taking
 * the currency, and serving the business's country (an empty list serves every country);
 * the lowest priority number wins. `null` means no provider can take it -- the caller
 * shows "billing isn't available for this currency yet", never a fallback to a provider
 * that doesn't support it.
 */
export function selectProvider(
  configs: ProviderConfig[],
  { currency, country }: { currency: string; country: string | null },
): ProviderConfig | null {
  const cur = currency.toUpperCase();
  const ctry = country?.toUpperCase() ?? null;
  const candidates = configs
    .filter(isCheckoutReady)
    .filter((c) => c.supportedCurrencies.includes(cur))
    .filter((c) => c.supportedCountries.length === 0 || (ctry !== null && c.supportedCountries.includes(ctry)))
    .sort((a, b) => a.priority - b.priority);
  return candidates[0] ?? null;
}

export function createProvider(config: ProviderConfig): BillingProvider {
  return config.provider === "stripe" ? createStripeProvider(config) : createRazorpayProvider(config);
}
