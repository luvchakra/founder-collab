import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { AI_PROVIDER_LABELS, type AiProvider } from "../ai-providers/types";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-09.3 ("Provider Routing", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13)
 * -- CONFIG-ONLY, per the user's explicit decision recorded in
 * `docs/design/platform-admin-portal-audit.md`. See the migration's own docstring
 * (`20260912370000_platform_ai_provider_routing.sql`) for the full reasoning: this file
 * reads and writes WonderArc's platform-wide AI routing *policy* (a default provider/
 * model, a `ModuleKey -> AiProvider` override map, a fallback provider) -- it does NOT
 * decide how any real AI call is actually routed. No function here is called by
 * `packages/core/src/ai/business-router.ts`, `operation-registry.ts`, `model-registry.ts`,
 * or `module-discovery`'s own router, and none of them import from this file. Wiring a real
 * consumer is explicitly deferred to a future, separate story once the BYOK-precedence/
 * failover/granularity/missing-key-fallback questions the prior stopped 09.3 entry raised
 * are separately answered.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so `platform.ai_provider_routing`'s own RLS (open SELECT, no
 * direct write grant to `authenticated` at all) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth on every path, matching every sibling
 * admin file -- `update_ai_provider_routing()` re-checks `platform.is_superadmin()` itself
 * too, since `SECURITY DEFINER` bypasses RLS.
 */

export type { AiProvider };
export { AI_PROVIDER_LABELS };

export type AiProviderRoutingModuleOverride = {
  moduleKey: ModuleKey;
  moduleName: string;
  provider: AiProvider;
};

export type AiProviderRouting = {
  defaultProvider: AiProvider | null;
  defaultModel: string | null;
  moduleOverrides: AiProviderRoutingModuleOverride[];
  fallbackProvider: AiProvider | null;
  updatedAt: string;
  updatedBy: string | null;
};

type AiProviderRoutingRow = {
  default_provider: AiProvider | null;
  default_model: string | null;
  module_overrides: Record<string, AiProvider>;
  fallback_provider: AiProvider | null;
  updated_at: string;
  updated_by: string | null;
};

type CoreModuleRow = { key: ModuleKey; name: string };

async function listAllCoreModules(): Promise<CoreModuleRow[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("modules").select("key, name").order("key");
  if (error) throw error;
  return data as CoreModuleRow[];
}

function toAiProviderRouting(row: AiProviderRoutingRow, modulesByKey: Map<ModuleKey, CoreModuleRow>): AiProviderRouting {
  return {
    defaultProvider: row.default_provider,
    defaultModel: row.default_model,
    moduleOverrides: Object.entries(row.module_overrides ?? {}).map(([moduleKey, provider]) => {
      const key = moduleKey as ModuleKey;
      return {
        moduleKey: key,
        moduleName: modulesByKey.get(key)?.name ?? moduleKey,
        provider,
      };
    }),
    fallbackProvider: row.fallback_provider,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** The one singleton routing-policy row, joined with the current module catalog so
 * `module_overrides`' raw keys get a human-readable name for display. */
export async function getAiProviderRouting(): Promise<AiProviderRouting> {
  await requireSuperadmin();
  const [supabase, modules] = await Promise.all([createClient({ schema: "platform" }), listAllCoreModules()]);
  const { data, error } = await supabase.from("ai_provider_routing").select("*").eq("id", true).single();
  if (error) throw error;

  const modulesByKey = new Map(modules.map((m) => [m.key, m]));
  return toAiProviderRouting(data as AiProviderRoutingRow, modulesByKey);
}

/** For the routing-policy form's provider/module dropdowns. */
export async function listAiProviderRoutingOptions(): Promise<{
  providers: { provider: AiProvider; label: string }[];
  modules: { key: ModuleKey; name: string }[];
}> {
  await requireSuperadmin();
  const modules = await listAllCoreModules();
  const providers = (Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => ({
    provider,
    label: AI_PROVIDER_LABELS[provider],
  }));
  return { providers, modules };
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

const providerSchema = z.enum(["openai", "anthropic", "google"]);

const optionalProviderSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || providerSchema.safeParse(v).success, "Not a recognized AI provider.");

const optionalModelSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/** One override entry as the form submits it -- a plain array rather than an already-built
 * object, since a `<select>`-per-module UI naturally produces a list of {moduleKey,
 * provider} pairs, not a keyed map. Converted to the `ModuleKey -> AiProvider` jsonb map
 * the database function expects at the very end, after validation. */
const moduleOverrideEntrySchema = z.object({
  moduleKey: z.string().trim().min(1),
  provider: providerSchema,
});

export const updateAiProviderRoutingSchema = z
  .object({
    defaultProvider: optionalProviderSchema,
    defaultModel: optionalModelSchema,
    moduleOverrides: z.array(moduleOverrideEntrySchema),
    fallbackProvider: optionalProviderSchema,
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of val.moduleOverrides.entries()) {
      if (seen.has(entry.moduleKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["moduleOverrides", index, "moduleKey"],
          message: "Each module can have at most one override.",
        });
      }
      seen.add(entry.moduleKey);
    }
  });
export type UpdateAiProviderRoutingInput = z.input<typeof updateAiProviderRoutingSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateAiProviderRouting(
  input: UpdateAiProviderRoutingInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateAiProviderRoutingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const moduleOverrides: Record<string, AiProvider> = {};
  for (const entry of parsed.data.moduleOverrides) moduleOverrides[entry.moduleKey] = entry.provider;

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_ai_provider_routing", {
    p_default_provider: parsed.data.defaultProvider,
    p_default_model: parsed.data.defaultModel,
    p_module_overrides: moduleOverrides,
    p_fallback_provider: parsed.data.fallbackProvider,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
