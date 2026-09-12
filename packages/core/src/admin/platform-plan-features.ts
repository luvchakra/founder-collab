import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-04.4 ("Feature-Level Entitlements", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §8): "Go beyond module-level licensing." Two tables -- see the migration's own docstring
 * for why `platform.features` (the catalog) and `platform.plan_features` (the per-plan
 * toggle) are separate, and why this is a different concept from PLATFORM-P0-08's future
 * operational `feature_flags` table.
 *
 * Same authorization shape as every other `platform.*` admin module in this file's own
 * sibling files: the request-scoped, cookie-authenticated client, so RLS
 * (`platform.is_superadmin()`) is the authoritative enforcement layer.
 */

export type PlatformFeature = {
  id: string;
  moduleKey: ModuleKey;
  key: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type FeatureRow = {
  id: string;
  module_key: ModuleKey;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toFeature(row: FeatureRow): PlatformFeature {
  return {
    id: row.id,
    moduleKey: row.module_key,
    key: row.key,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** The whole feature catalog, across every module -- callers group by `moduleKey`
 * themselves (the admin UI groups by module; a future entitlement check would look up one
 * feature directly). */
export async function listFeatures(): Promise<PlatformFeature[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("features").select("*").order("module_key").order("key");
  if (error) throw error;
  return (data as FeatureRow[]).map(toFeature);
}

export const createFeatureSchema = z.object({
  moduleKey: z.string().trim().min(1, "Choose a module"),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Feature key is required")
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, and underscores only, e.g. \"advanced_signals\""),
  name: z.string().trim().min(1, "Feature name is required"),
  description: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});
export type CreateFeatureInput = z.input<typeof createFeatureSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Adds a new feature to the catalog -- global, not scoped to any one plan. Every existing
 * plan implicitly does not entitle it yet (no `plan_features` row is created here: see
 * that table's own "no row = not entitled" default in the migration's docstring). */
export async function createFeature(
  input: CreateFeatureInput,
): Promise<{ ok: true; feature: PlatformFeature } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createFeatureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("features")
    .insert({
      module_key: parsed.data.moduleKey,
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { key: "A feature with this key already exists for this module." } };
    }
    throw error;
  }
  return { ok: true, feature: toFeature(data as FeatureRow) };
}

/** Removes a feature from the catalog entirely -- cascades to every plan's own
 * entitlement row for it (`plan_features.feature_id on delete cascade`), not merely
 * disabling it for one plan. */
export async function deleteFeature(featureId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.from("features").delete().eq("id", featureId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PlanFeatureEntitlement = {
  featureId: string;
  moduleKey: ModuleKey;
  featureKey: string;
  featureName: string;
  featureDescription: string | null;
  enabled: boolean;
};

type PlanFeatureRow = { feature_id: string; enabled: boolean };

/** Every catalog feature's entitlement state for one plan -- a feature with no
 * `plan_features` row for this plan is `enabled: false` (see the migration's own
 * docstring on why "no row" and "false" are both valid representations of "not
 * entitled"), never fabricated as `true`. */
export async function listPlanFeatureEntitlements(planId: string): Promise<PlanFeatureEntitlement[]> {
  await requireSuperadmin();
  const [features, supabase] = await Promise.all([listFeatures(), createClient({ schema: "platform" })]);
  const { data, error } = await supabase.from("plan_features").select("feature_id, enabled").eq("plan_id", planId);
  if (error) throw error;

  const byFeatureId = new Map((data as PlanFeatureRow[]).map((row) => [row.feature_id, row.enabled]));
  return features.map((f) => ({
    featureId: f.id,
    moduleKey: f.moduleKey,
    featureKey: f.key,
    featureName: f.name,
    featureDescription: f.description,
    enabled: byFeatureId.get(f.id) ?? false,
  }));
}

export async function setPlanFeatureEnabled(
  planId: string,
  featureId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("plan_features").upsert(
    {
      plan_id: planId,
      feature_id: featureId,
      enabled,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,feature_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
