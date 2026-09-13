import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-08.1/08.2/08.3/08.4 ("Feature Flags", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §12). See the migration's own docstring
 * (`20260912270000_platform_feature_flags.sql`) for why `platform.feature_flags` is
 * genuinely distinct from `platform.features`/`platform.plan_features` (04.4's commercial
 * entitlement catalog) and for this run's own scope decision not to wire any real kill
 * switch into another workstream's module code this story.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so `platform.feature_flags`' own RLS (open SELECT, no direct
 * write grant to `authenticated` at all) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth on every write path, matching every
 * sibling admin file -- the three RPCs below re-check `platform.is_superadmin()`
 * themselves too, since `SECURITY DEFINER` bypasses RLS.
 *
 * **Every mutation goes through `platform.create_feature_flag()`/`update_feature_flag()`/
 * `delete_feature_flag()`** -- there is no plain `.insert()`/`.update()`/`.delete()` path
 * anywhere in this file, on purpose: §12.4 requires every change (not only a
 * disable/enable flip) to be audited with who/what/old value/new value/reason/timestamp,
 * so a `reason` is structurally required by the database for every mutation, not merely
 * validated client-side.
 */

export type FeatureFlagScopeType = "global" | "plan" | "module" | "country";

export type FeatureFlag = {
  id: string;
  featureKey: string;
  description: string | null;
  enabled: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  scopeType: FeatureFlagScopeType;
  scopePlan: { id: string; name: string } | null;
  scopeModule: { key: ModuleKey; name: string } | null;
  scopeCountryCode: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type FeatureFlagRow = {
  id: string;
  feature_key: string;
  description: string | null;
  enabled: boolean;
  effective_from: string | null;
  effective_to: string | null;
  scope_type: FeatureFlagScopeType;
  scope_plan_id: string | null;
  scope_module_key: ModuleKey | null;
  scope_country_code: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type PlanRow = { id: string; name: string };
type CoreModuleRow = { key: ModuleKey; name: string };

async function listAllPlans(): Promise<PlanRow[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("plans").select("id, name").order("display_order");
  if (error) throw error;
  return data as PlanRow[];
}

async function listAllCoreModules(): Promise<CoreModuleRow[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("modules").select("key, name").order("key");
  if (error) throw error;
  return data as CoreModuleRow[];
}

function toFeatureFlag(
  row: FeatureFlagRow,
  plansById: Map<string, PlanRow>,
  modulesByKey: Map<ModuleKey, CoreModuleRow>,
): FeatureFlag {
  const plan = row.scope_plan_id ? plansById.get(row.scope_plan_id) : undefined;
  const module_ = row.scope_module_key ? modulesByKey.get(row.scope_module_key) : undefined;
  return {
    id: row.id,
    featureKey: row.feature_key,
    description: row.description,
    enabled: row.enabled,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    scopeType: row.scope_type,
    scopePlan: row.scope_plan_id ? { id: row.scope_plan_id, name: plan?.name ?? row.scope_plan_id } : null,
    scopeModule: row.scope_module_key
      ? { key: row.scope_module_key, name: module_?.name ?? row.scope_module_key }
      : null,
    scopeCountryCode: row.scope_country_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Every feature flag, across every scope -- callers group/filter as needed (the admin UI
 * lists them all in one table/card list, newest first). */
export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  await requireSuperadmin();
  const [supabase, plans, modules] = await Promise.all([
    createClient({ schema: "platform" }),
    listAllPlans(),
    listAllCoreModules(),
  ]);
  const { data, error } = await supabase.from("feature_flags").select("*").order("created_at", { ascending: false });
  if (error) throw error;

  const plansById = new Map(plans.map((p) => [p.id, p]));
  const modulesByKey = new Map(modules.map((m) => [m.key, m]));
  return (data as FeatureFlagRow[]).map((row) => toFeatureFlag(row, plansById, modulesByKey));
}

/** For the "Add a flag" dialog's scope-target dropdowns. */
export async function listFeatureFlagScopeOptions(): Promise<{
  plans: { id: string; name: string }[];
  modules: { key: ModuleKey; name: string }[];
}> {
  await requireSuperadmin();
  const [plans, modules] = await Promise.all([listAllPlans(), listAllCoreModules()]);
  return { plans, modules };
}

const featureKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Feature key is required")
  .max(100, "Feature key must be 100 characters or fewer.")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, and underscores only, e.g. \"ai_research\"");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be 2000 characters or fewer.")
  .transform((v) => (v === "" ? null : v));

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Empty string (an unset date picker) normalizes to `null`; otherwise must be a value
 * `Date` can parse, forwarded as an ISO string for Postgres's `timestamptz` input. */
const optionalDateTimeSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Not a valid date/time.")
  .transform((v) => (v === null ? null : new Date(v).toISOString()));

export const createFeatureFlagSchema = z
  .object({
    featureKey: featureKeySchema,
    description: descriptionSchema,
    enabled: z.boolean(),
    effectiveFrom: optionalDateTimeSchema,
    effectiveTo: optionalDateTimeSchema,
    scopeType: z.enum(["global", "plan", "module", "country"]),
    scopePlanId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    scopeModuleKey: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    scopeCountryCode: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v)),
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    if (val.effectiveFrom && val.effectiveTo && val.effectiveTo <= val.effectiveFrom) {
      ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be after the start date/time." });
    }
    if (val.scopeType === "plan" && !val.scopePlanId) {
      ctx.addIssue({ code: "custom", path: ["scopePlanId"], message: "Choose a plan for a plan-scoped flag." });
    }
    if (val.scopeType === "module" && !val.scopeModuleKey) {
      ctx.addIssue({ code: "custom", path: ["scopeModuleKey"], message: "Choose a module for a module-scoped flag." });
    }
    if (val.scopeType === "country") {
      if (!val.scopeCountryCode) {
        ctx.addIssue({ code: "custom", path: ["scopeCountryCode"], message: "Enter a country for a country-scoped flag." });
      } else if (!/^[A-Z]{2}$/.test(val.scopeCountryCode)) {
        ctx.addIssue({
          code: "custom",
          path: ["scopeCountryCode"],
          message: "Use a 2-letter ISO country code, e.g. \"IN\".",
        });
      }
    }
  });
export type CreateFeatureFlagInput = z.input<typeof createFeatureFlagSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createFeatureFlag(
  input: CreateFeatureFlagInput,
): Promise<{ ok: true; id: string } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createFeatureFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("create_feature_flag", {
    p_feature_key: parsed.data.featureKey,
    p_description: parsed.data.description,
    p_enabled: parsed.data.enabled,
    p_effective_from: parsed.data.effectiveFrom,
    p_effective_to: parsed.data.effectiveTo,
    p_scope_type: parsed.data.scopeType,
    p_scope_plan_id: parsed.data.scopeType === "plan" ? parsed.data.scopePlanId : null,
    p_scope_module_key: parsed.data.scopeType === "module" ? parsed.data.scopeModuleKey : null,
    p_scope_country_code: parsed.data.scopeType === "country" ? parsed.data.scopeCountryCode : null,
    p_reason: parsed.data.reason,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { featureKey: "A feature flag with this key already exists." } };
    }
    return { ok: false, fieldErrors: { featureKey: error.message } };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export const updateFeatureFlagSchema = z
  .object({
    id: z.string().uuid(),
    description: descriptionSchema,
    enabled: z.boolean(),
    effectiveFrom: optionalDateTimeSchema,
    effectiveTo: optionalDateTimeSchema,
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    if (val.effectiveFrom && val.effectiveTo && val.effectiveTo <= val.effectiveFrom) {
      ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be after the start date/time." });
    }
  });
export type UpdateFeatureFlagInput = z.input<typeof updateFeatureFlagSchema>;

/** Only `description`/`enabled`/`effectiveFrom`/`effectiveTo` are ever mutated -- see the
 * migration's own docstring for why `featureKey` and scope are immutable after creation. */
export async function updateFeatureFlag(
  input: UpdateFeatureFlagInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateFeatureFlagSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_feature_flag", {
    p_id: parsed.data.id,
    p_description: parsed.data.description,
    p_enabled: parsed.data.enabled,
    p_effective_from: parsed.data.effectiveFrom,
    p_effective_to: parsed.data.effectiveTo,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const deleteFeatureFlagSchema = z.object({ id: z.string().uuid(), reason: reasonSchema });
export type DeleteFeatureFlagInput = z.input<typeof deleteFeatureFlagSchema>;

export async function deleteFeatureFlag(
  input: DeleteFeatureFlagInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = deleteFeatureFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("delete_feature_flag", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * PLATFORM-P0-17.3 ("Rollback"): restores a feature flag to a previous version by
 * re-invoking `updateFeatureFlag()` with that version's own `feature_flag_events.new_value`
 * snapshot -- see `restorePlanFromSnapshot()` in `platform-plans.ts` for why this is
 * genuinely just another edit, not a separate mechanism. `featureKey`/scope are immutable
 * and not part of `updateFeatureFlagSchema` at all, so nothing here can restore them even
 * if a snapshot predates the flag's current scope. Called only from `config-history.ts`'s
 * generic restore dispatcher.
 */
export async function restoreFeatureFlagFromSnapshot(
  id: string,
  snapshot: Record<string, unknown>,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  return updateFeatureFlag({
    id,
    description: String(snapshot.description ?? ""),
    enabled: Boolean(snapshot.enabled),
    effectiveFrom: (snapshot.effective_from as string | null) ?? "",
    effectiveTo: (snapshot.effective_to as string | null) ?? "",
    reason,
  });
}

/**
 * Pure, unit-testable derivation of a flag's *current* effective state from its own stored
 * `enabled`/`effectiveFrom`/`effectiveTo` fields (CLAUDE.md development principle #9 --
 * non-trivial logic testable without a database). Deliberately **not** called from
 * anywhere outside the admin UI's own status badge this story: no other subsystem reads
 * `platform.feature_flags` yet (see this file's own top-of-file docstring and the
 * migration's own header comment for why real kill-switch wiring into any specific module
 * is out of this story's scope).
 */
export function isFeatureFlagActive(
  flag: { enabled: boolean; effectiveFrom: string | null; effectiveTo: string | null },
  now: Date = new Date(),
): boolean {
  if (!flag.enabled) return false;
  if (flag.effectiveFrom && now < new Date(flag.effectiveFrom)) return false;
  if (flag.effectiveTo && now > new Date(flag.effectiveTo)) return false;
  return true;
}
