import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { AI_PROVIDER_LABELS, type AiProvider } from "../ai-providers/types";

/**
 * PLATFORM-P0-09.4 ("AI Feature Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §13) -- CONFIG-ONLY, same scope as PLATFORM-P0-09.3. See the migration's own docstring
 * (`20260912380000_platform_ai_feature_policies.sql`) for the full reasoning: this file
 * reads and writes a platform-wide *ceiling* policy (AI enabled, allowed providers/models,
 * per-run token/cost caps, a daily platform budget) -- it does NOT enforce any of it. No
 * function here is called by `packages/core/src/ai/business-router.ts`,
 * `operation-registry.ts`, `model-registry.ts`, or `module-discovery`'s own router, and none
 * of them import from this file.
 *
 * **PLATFORM-P0-10.1 extension (§14, "AI Safety / Cost Controls", user-decided, see
 * `20260912390000_platform_ai_feature_policies_monthly_budget.sql`'s own docstring for the
 * full reasoning)**: `monthlyBudgetUsd` was added here as the SAME kind of platform-wide,
 * config-only ceiling as `dailyPlatformBudgetUsd` -- not a new table, not a new mutation
 * path. Real enforcement (pausing AI, notifying SUPERADMIN when a threshold is exceeded --
 * PLATFORM-P0-10.2) and any per-business/per-feature budget dimension remain explicitly
 * deferred and are NOT built by this file.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so `platform.ai_feature_policies`' own RLS (open SELECT, no
 * direct write grant to `authenticated` at all) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth, matching every sibling admin file --
 * `update_ai_feature_policies()` re-checks `platform.is_superadmin()` itself too, since
 * `SECURITY DEFINER` bypasses RLS.
 */

export type { AiProvider };
export { AI_PROVIDER_LABELS };

export type AiFeaturePolicy = {
  aiEnabled: boolean;
  allowedProviders: AiProvider[];
  allowedModels: string[];
  maxTokensPerRun: number | null;
  maxRunCostUsd: number | null;
  dailyPlatformBudgetUsd: number | null;
  monthlyBudgetUsd: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

type AiFeaturePolicyRow = {
  ai_enabled: boolean;
  allowed_providers: AiProvider[];
  allowed_models: string[];
  max_tokens_per_run: number | null;
  max_run_cost_usd: number | string | null;
  daily_platform_budget_usd: number | string | null;
  monthly_budget_usd: number | string | null;
  updated_at: string;
  updated_by: string | null;
};

function toAiFeaturePolicy(row: AiFeaturePolicyRow): AiFeaturePolicy {
  return {
    aiEnabled: row.ai_enabled,
    allowedProviders: row.allowed_providers,
    allowedModels: row.allowed_models,
    maxTokensPerRun: row.max_tokens_per_run,
    // Postgres numeric columns come back as strings over the JS client to avoid float
    // precision loss -- converted to number here since neither value is ever used for
    // exact-money arithmetic in this file (display and round-trip into the form only).
    maxRunCostUsd: row.max_run_cost_usd === null ? null : Number(row.max_run_cost_usd),
    dailyPlatformBudgetUsd: row.daily_platform_budget_usd === null ? null : Number(row.daily_platform_budget_usd),
    monthlyBudgetUsd: row.monthly_budget_usd === null ? null : Number(row.monthly_budget_usd),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** The one singleton feature-policy row. */
export async function getAiFeaturePolicy(): Promise<AiFeaturePolicy> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("ai_feature_policies").select("*").eq("id", true).single();
  if (error) throw error;
  return toAiFeaturePolicy(data as AiFeaturePolicyRow);
}

/** For the policy form's provider-selection checkboxes. */
export async function listAiFeaturePolicyProviderOptions(): Promise<{ provider: AiProvider; label: string }[]> {
  await requireSuperadmin();
  return (Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => ({
    provider,
    label: AI_PROVIDER_LABELS[provider],
  }));
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Comma-separated model IDs -> a deduplicated, order-preserving list -- same shape
 * `platform-ai-providers.ts`'s own `modelListSchema` already established for the same kind
 * of free-text model list. */
const modelListSchema = z.string().transform((value) => {
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
});

/** Empty string (an unset numeric field) normalizes to `null`; otherwise must be a positive
 * number, matching the table's own CHECK constraints. */
function optionalPositiveNumberSchema(label: string) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) > 0), `${label} must be a positive number.`)
    .transform((v) => (v === null ? null : Number(v)));
}

export const updateAiFeaturePolicySchema = z.object({
  aiEnabled: z.boolean(),
  allowedProviders: z.array(z.enum(["openai", "anthropic", "google"])),
  allowedModels: modelListSchema,
  maxTokensPerRun: optionalPositiveNumberSchema("Maximum tokens per run"),
  maxRunCostUsd: optionalPositiveNumberSchema("Maximum run cost"),
  dailyPlatformBudgetUsd: optionalPositiveNumberSchema("Daily platform budget"),
  monthlyBudgetUsd: optionalPositiveNumberSchema("Monthly platform budget"),
  reason: reasonSchema,
});
export type UpdateAiFeaturePolicyInput = z.input<typeof updateAiFeaturePolicySchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateAiFeaturePolicy(
  input: UpdateAiFeaturePolicyInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateAiFeaturePolicySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_ai_feature_policies", {
    p_ai_enabled: parsed.data.aiEnabled,
    p_allowed_providers: parsed.data.allowedProviders,
    p_allowed_models: parsed.data.allowedModels,
    p_max_tokens_per_run: parsed.data.maxTokensPerRun,
    p_max_run_cost_usd: parsed.data.maxRunCostUsd,
    p_daily_platform_budget_usd: parsed.data.dailyPlatformBudgetUsd,
    p_monthly_budget_usd: parsed.data.monthlyBudgetUsd,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
