import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { encryptApiKey, fingerprintApiKey } from "../crypto/api-key";
import { environmentOfKey } from "../billing/provider-config";
import type { BillingEnvironment, BillingProviderKey } from "../billing/subscription-types";

/**
 * BILL-06 / BILL-29 -- the superadmin side of billing configuration
 * (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §40-§43, §48).
 *
 * Every write goes through one reason-required SECURITY DEFINER function that checks
 * platform.is_superadmin() itself and records a *_events row. Secrets are encrypted here,
 * before they leave this process, and are never read back: the admin page only ever sees
 * "configured" plus an 8-character fingerprint (§43).
 *
 * This is also PLATFORM-P1-05.2 ("Billing Provider: configure provider and environment",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §27) -- provider, enabled, test/live
 * environment and priority per provider -- so the Platform Admin backlog story is served
 * here rather than by a second provider table.
 */

export type BillingProviderStatus = {
  provider: BillingProviderKey;
  enabled: boolean;
  environment: BillingEnvironment;
  priority: number;
  supportedCurrencies: string[];
  supportedCountries: string[];
  publicKey: string | null;
  accountId: string | null;
  secretKeyConfigured: boolean;
  secretKeyFingerprint: string | null;
  webhookSecretConfigured: boolean;
  webhookSecretFingerprint: string | null;
  lastWebhookAt: string | null;
  lastWebhookFailureAt: string | null;
  updatedAt: string | null;
};

type StatusRow = {
  provider: BillingProviderKey;
  enabled: boolean;
  environment: BillingEnvironment;
  priority: number;
  supported_currencies: string[] | null;
  supported_countries: string[] | null;
  public_key: string | null;
  account_id: string | null;
  secret_key_configured: boolean;
  secret_key_fingerprint: string | null;
  webhook_secret_configured: boolean;
  webhook_secret_fingerprint: string | null;
  last_webhook_at: string | null;
  last_webhook_failure_at: string | null;
  updated_at: string | null;
};

export async function getBillingProviderStatus(): Promise<BillingProviderStatus[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("billing_provider_status");
  if (error) throw error;
  return ((data ?? []) as StatusRow[]).map((r) => ({
    provider: r.provider,
    enabled: r.enabled,
    environment: r.environment,
    priority: r.priority,
    supportedCurrencies: r.supported_currencies ?? [],
    supportedCountries: r.supported_countries ?? [],
    publicKey: r.public_key,
    accountId: r.account_id,
    secretKeyConfigured: r.secret_key_configured,
    secretKeyFingerprint: r.secret_key_fingerprint,
    webhookSecretConfigured: r.webhook_secret_configured,
    webhookSecretFingerprint: r.webhook_secret_fingerprint,
    lastWebhookAt: r.last_webhook_at,
    lastWebhookFailureAt: r.last_webhook_failure_at,
    updatedAt: r.updated_at,
  }));
}

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const reason = z.string().trim().min(1, "A reason is required.").max(500, "Reason must be 500 characters or fewer.");

const codeList = (pattern: RegExp, label: string) =>
  z
    .array(z.string().trim().toUpperCase())
    .transform((list) => Array.from(new Set(list.filter((v) => v !== ""))))
    .pipe(z.array(z.string().regex(pattern, `Each ${label} must be a ${label === "currency" ? "3" : "2"}-letter code.`)).max(50));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().max(max).nullable());

export const updateBillingProviderSchema = z.object({
  provider: z.enum(["razorpay", "stripe"]),
  enabled: z.boolean(),
  environment: z.enum(["test", "live"]),
  priority: z.coerce.number().int().min(0).max(1000),
  supportedCurrencies: codeList(/^[A-Z]{3}$/, "currency"),
  supportedCountries: codeList(/^[A-Z]{2}$/, "country"),
  publicKey: optionalText(200),
  accountId: optionalText(200),
  reason,
});
export type UpdateBillingProviderInput = z.input<typeof updateBillingProviderSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function invalid(error: z.ZodError): Result {
  const fieldErrors = fieldErrorsFrom(error);
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
}

export async function updateBillingProvider(input: UpdateBillingProviderInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = updateBillingProviderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.enabled && d.supportedCurrencies.length === 0) {
    return { ok: false, error: "An enabled provider needs at least one currency.", fieldErrors: { supportedCurrencies: "Add at least one currency." } };
  }
  if (d.publicKey) {
    const keyEnv = environmentOfKey(d.provider, d.publicKey);
    if (keyEnv && keyEnv !== d.environment) {
      return { ok: false, error: `That is a ${keyEnv} key, but the provider is set to ${d.environment}.`, fieldErrors: { publicKey: `This is a ${keyEnv} key.` } };
    }
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_billing_provider", {
    p_provider: d.provider,
    p_enabled: d.enabled,
    p_environment: d.environment,
    p_priority: d.priority,
    p_supported_currencies: d.supportedCurrencies,
    p_supported_countries: d.supportedCountries,
    p_public_key: d.publicKey,
    p_account_id: d.accountId,
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const optionalSecret = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().min(8, "That doesn't look like a complete key.").max(500).nullable());

export const setBillingProviderSecretsSchema = z.object({
  provider: z.enum(["razorpay", "stripe"]),
  environment: z.enum(["test", "live"]),
  /** Blank keeps the stored value. */
  secretKey: optionalSecret,
  webhookSecret: optionalSecret,
  reason,
});
export type SetBillingProviderSecretsInput = z.input<typeof setBillingProviderSecretsSchema>;

/** Stores new secrets, encrypted. Blank fields keep what's stored. The plaintext never
 * reaches the database, the audit trail or a log -- only ciphertext and a fingerprint. */
export async function setBillingProviderSecrets(input: SetBillingProviderSecretsInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = setBillingProviderSecretsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!d.secretKey && !d.webhookSecret) return { ok: false, error: "Enter a secret key or a webhook secret." };
  if (d.secretKey) {
    const keyEnv = environmentOfKey(d.provider, d.secretKey);
    if (keyEnv && keyEnv !== d.environment) {
      return { ok: false, error: `That is a ${keyEnv} key, but the provider is set to ${d.environment}.`, fieldErrors: { secretKey: `This is a ${keyEnv} key.` } };
    }
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_billing_provider_secrets", {
    p_provider: d.provider,
    p_encrypted_secret_key: d.secretKey ? encryptApiKey(d.secretKey) : null,
    p_secret_key_fingerprint: d.secretKey ? fingerprintApiKey(d.secretKey) : null,
    p_encrypted_webhook_secret: d.webhookSecret ? encryptApiKey(d.webhookSecret) : null,
    p_webhook_secret_fingerprint: d.webhookSecret ? fingerprintApiKey(d.webhookSecret) : null,
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type BillingSettings = {
  upgradeTiming: "immediate" | "next_renewal";
  downgradeTiming: "immediate" | "next_renewal";
  prorationEnabled: boolean;
  updatedAt: string | null;
};

export async function getBillingSettings(): Promise<BillingSettings> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("billing_settings")
    .select("upgrade_timing, downgrade_timing, proration_enabled, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    upgradeTiming: (data?.upgrade_timing as BillingSettings["upgradeTiming"]) ?? "immediate",
    downgradeTiming: (data?.downgrade_timing as BillingSettings["downgradeTiming"]) ?? "next_renewal",
    prorationEnabled: data?.proration_enabled ?? true,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export const updateBillingSettingsSchema = z.object({
  upgradeTiming: z.enum(["immediate", "next_renewal"]),
  downgradeTiming: z.enum(["immediate", "next_renewal"]),
  prorationEnabled: z.boolean(),
  reason,
});
export type UpdateBillingSettingsInput = z.input<typeof updateBillingSettingsSchema>;

export async function updateBillingSettings(input: UpdateBillingSettingsInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = updateBillingSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_billing_settings", {
    p_upgrade_timing: parsed.data.upgradeTiming,
    p_downgrade_timing: parsed.data.downgradeTiming,
    p_proration_enabled: parsed.data.prorationEnabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
