import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { encryptApiKey, fingerprintApiKey } from "../crypto/api-key";
import { testProviderConnection } from "../ai-providers/test-connection";
import { AI_PROVIDER_LABELS, type AiProvider } from "../ai-providers/types";

/**
 * PLATFORM-P0-09.1/09.2 ("Internal AI Provider Registry" / "Secure API Key Storage",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13). See the migration's own docstring
 * (`20260912280000_platform_ai_providers.sql`) for why this is genuinely distinct from
 * `core.ai_provider_credentials`/`discovery.ai_provider_credentials` (per-tenant BYOK) and
 * for the full secret-lockdown reasoning.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so RLS (open SELECT on `platform.ai_providers`, zero grant at
 * all on `platform.ai_provider_keys`) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth on every write path, matching every sibling
 * admin file -- the four RPCs below re-check `platform.is_superadmin()` themselves too,
 * since `SECURITY DEFINER` bypasses RLS.
 *
 * **A plaintext API key exists in this process's memory only as long as it takes to test
 * and encrypt it** -- never logged (no `console.log`/`console.error` anywhere in this file
 * ever includes `apiKey`), never returned to the caller, and never sent to Postgres:
 * `setAiProviderKey()` calls `encryptApiKey()`/`fingerprintApiKey()` itself and the RPC
 * receives only the ciphertext and the non-reversible fingerprint. There is no
 * `getAiProviderKey()`/`revealAiProviderKey()` function anywhere in this file, or anywhere
 * in this codebase's `platform.*` surface -- `listAiProviders()` below is the only read
 * path, and it never selects `encrypted_api_key`.
 */

export type { AiProvider };
export { AI_PROVIDER_LABELS };

export type AiProviderConfig = {
  provider: AiProvider;
  label: string;
  enabled: boolean;
  models: string[];
  defaultModel: string | null;
  fallbackModel: string | null;
  rateLimits: Record<string, unknown>;
  costControls: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string | null;
  /** Never the key itself -- see this file's own top-of-file docstring. */
  configured: boolean;
  keyFingerprint: string | null;
  keyLastValidatedAt: string | null;
  keyUpdatedAt: string | null;
};

type AiProviderRow = {
  provider: AiProvider;
  enabled: boolean;
  models: string[];
  default_model: string | null;
  fallback_model: string | null;
  rate_limits: Record<string, unknown>;
  cost_controls: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

type AiProviderKeyStatusRow = {
  provider: AiProvider;
  configured: boolean;
  key_fingerprint: string | null;
  last_validated_at: string | null;
  key_updated_at: string | null;
};

/** Every registered provider (always the same three -- see the migration's own "fixed,
 * seeded catalog" reasoning), joined with its own masked key status. Never selects
 * `encrypted_api_key` -- `platform.ai_provider_keys` grants `authenticated` no SELECT at
 * all, so the only source for "is a key configured" is the `ai_provider_key_status()`
 * SECURITY DEFINER function. */
export async function listAiProviders(): Promise<AiProviderConfig[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const [providersResult, keyStatusResult] = await Promise.all([
    supabase.from("ai_providers").select("*").order("provider"),
    supabase.rpc("ai_provider_key_status"),
  ]);
  if (providersResult.error) throw providersResult.error;
  if (keyStatusResult.error) throw keyStatusResult.error;

  const keyStatusByProvider = new Map(
    (keyStatusResult.data as AiProviderKeyStatusRow[]).map((row) => [row.provider, row]),
  );

  return (providersResult.data as AiProviderRow[]).map((row) => {
    const keyStatus = keyStatusByProvider.get(row.provider);
    return {
      provider: row.provider,
      label: AI_PROVIDER_LABELS[row.provider],
      enabled: row.enabled,
      models: row.models,
      defaultModel: row.default_model,
      fallbackModel: row.fallback_model,
      rateLimits: row.rate_limits,
      costControls: row.cost_controls,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      configured: keyStatus?.configured ?? false,
      keyFingerprint: keyStatus?.key_fingerprint ?? null,
      keyLastValidatedAt: keyStatus?.last_validated_at ?? null,
      keyUpdatedAt: keyStatus?.key_updated_at ?? null,
    };
  });
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Comma-separated model IDs -> a deduplicated, order-preserving list. An empty field
 * means "no models configured yet," not an error -- a provider can be registered before
 * anyone has decided which models it may serve. */
const modelListSchema = z.string().transform((value) => {
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
});

/** Free-form JSON object -- see the migration's own header comment for why `rate_limits`/
 * `cost_controls` are deliberately opaque (no consumer enforces either yet, and §13 names
 * them with no fields/units of its own). Empty input normalizes to `{}`. */
const jsonObjectSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "{}" : value))
  .superRefine((value, ctx) => {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "Must be a JSON object, e.g. {} or {\"maxConcurrent\": 5}" });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Must be valid JSON, e.g. {} or {\"maxConcurrent\": 5}" });
    }
  })
  .transform((value) => JSON.parse(value) as Record<string, unknown>);

export const updateAiProviderConfigSchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "google"]),
    enabled: z.boolean(),
    models: modelListSchema,
    defaultModel: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    fallbackModel: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    rateLimits: jsonObjectSchema,
    costControls: jsonObjectSchema,
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    if (val.defaultModel && !val.models.includes(val.defaultModel)) {
      ctx.addIssue({ code: "custom", path: ["defaultModel"], message: "Must be one of the configured models." });
    }
    if (val.fallbackModel && !val.models.includes(val.fallbackModel)) {
      ctx.addIssue({ code: "custom", path: ["fallbackModel"], message: "Must be one of the configured models." });
    }
  });
export type UpdateAiProviderConfigInput = z.input<typeof updateAiProviderConfigSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateAiProviderConfig(
  input: UpdateAiProviderConfigInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateAiProviderConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_ai_provider_config", {
    p_provider: parsed.data.provider,
    p_enabled: parsed.data.enabled,
    p_models: parsed.data.models,
    p_default_model: parsed.data.defaultModel,
    p_fallback_model: parsed.data.fallbackModel,
    p_rate_limits: parsed.data.rateLimits,
    p_cost_controls: parsed.data.costControls,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export const setAiProviderKeySchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().trim().min(1, "API key is required."),
  reason: reasonSchema,
});
export type SetAiProviderKeyInput = z.input<typeof setAiProviderKeySchema>;

/**
 * Sets (or rotates) a provider's key. Tests it against the real provider first
 * (`testProviderConnection()`, already-shared infrastructure BYOK's own
 * `connectAiProvider()` uses identically) -- a rejected key is never persisted, matching
 * that same precedent exactly. The plaintext key never reaches this function's return
 * value, a log line, or the database: only `encryptApiKey(apiKey)`'s ciphertext and
 * `fingerprintApiKey(apiKey)`'s non-reversible fingerprint are ever sent to
 * `set_ai_provider_key()`.
 */
export async function setAiProviderKey(
  input: SetAiProviderKeyInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = setAiProviderKeySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const testResult = await testProviderConnection(parsed.data.provider, parsed.data.apiKey);
  if (!testResult.ok) return { ok: false, error: testResult.error, fieldErrors: { apiKey: testResult.error } };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_ai_provider_key", {
    p_provider: parsed.data.provider,
    p_encrypted_api_key: encryptApiKey(parsed.data.apiKey),
    p_key_fingerprint: fingerprintApiKey(parsed.data.apiKey),
    p_last_validated_at: new Date().toISOString(),
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export const removeAiProviderKeySchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  reason: reasonSchema,
});
export type RemoveAiProviderKeyInput = z.input<typeof removeAiProviderKeySchema>;

export async function removeAiProviderKey(
  input: RemoveAiProviderKeyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = removeAiProviderKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("remove_ai_provider_key", {
    p_provider: parsed.data.provider,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
