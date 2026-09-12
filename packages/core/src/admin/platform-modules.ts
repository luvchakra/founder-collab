import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-07.1 ("Module Registry", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11).
 * `platform.modules` -- see the migration's own docstring for why this is genuinely new
 * (not a duplicate of `core.modules` or `packages/module-registry`) and why `licensed`/
 * `minimum_plan` are computed here rather than stored columns.
 *
 * Same authorization shape as every other `platform.*` admin data-access module in this
 * backlog: the request-scoped, cookie-authenticated client (not `createAdminClient`), so
 * `platform.modules`' own RLS (`platform.is_superadmin()` for writes, open SELECT for any
 * authenticated user) is the authoritative enforcement layer -- `requireSuperadmin()` here
 * is defense-in-depth on the two write paths, matching every sibling file.
 *
 * `enabled` (the PLATFORM-P0-07.2 kill switch) is deliberately read-only from this file:
 * no `setModuleEnabled` export exists here. That story's own "reason + impact confirmation
 * + explicit confirmation + audit record" flow is real, additional scope this file must not
 * pre-empt by exposing a plain, confirmation-free toggle for the same column.
 */

export type ModuleStatus = "available" | "read_only" | "maintenance" | "disabled";
const MODULE_STATUSES = ["available", "read_only", "maintenance", "disabled"] as const;

export type ModuleRegistryEntry = {
  moduleKey: ModuleKey;
  moduleName: string;
  moduleDescription: string | null;
  enabled: boolean;
  visible: boolean;
  /** Always true today -- every row in `core.modules` is, by definition, a licensable
   * module (see the migration's own docstring on why this is computed, not stored). */
  licensed: boolean;
  /** The lowest-`display_order` active plan whose `plan_modules` row includes this module,
   * or `null` when no active plan currently does (an honest gap, never fabricated). Derived
   * from `platform.plan_modules`/`platform.plans` -- the canonical "which plan includes
   * this module" relationship (PLATFORM-P0-04.3), not a second stored answer to the same
   * question. */
  minimumPlan: { key: string; name: string } | null;
  status: ModuleStatus;
  version: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

type CoreModuleRow = { key: ModuleKey; name: string; description: string | null };
type PlatformModuleRow = {
  module_key: ModuleKey;
  enabled: boolean;
  visible: boolean;
  status: ModuleStatus;
  version: string | null;
  updated_at: string;
  updated_by: string | null;
};
type PlanModuleRow = { module_key: ModuleKey; enabled: boolean; plan_id: string };
type PlanRow = { id: string; key: string; name: string; display_order: number; status: string };

async function listAllCoreModules(): Promise<CoreModuleRow[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("modules").select("key, name, description").order("key");
  if (error) throw error;
  return data as CoreModuleRow[];
}

/** For each module key, the cheapest (lowest `display_order`) `active` plan that includes
 * it via `platform.plan_modules.enabled = true` -- a `draft`/`deprecated`/`archived` plan
 * is never a real "minimum plan" a customer can actually buy today. Exported so its
 * non-trivial derivation logic is unit-testable without a database (CLAUDE.md development
 * principle #9). */
export function computeMinimumPlans(
  planModules: PlanModuleRow[],
  plans: PlanRow[],
): Map<ModuleKey, { key: string; name: string }> {
  const activePlansById = new Map(plans.filter((p) => p.status === "active").map((p) => [p.id, p]));
  const best = new Map<ModuleKey, PlanRow>();
  for (const row of planModules) {
    if (!row.enabled) continue;
    const plan = activePlansById.get(row.plan_id);
    if (!plan) continue;
    const current = best.get(row.module_key);
    if (!current || plan.display_order < current.display_order) {
      best.set(row.module_key, plan);
    }
  }
  return new Map([...best].map(([key, plan]) => [key, { key: plan.key, name: plan.name }]));
}

export async function listModuleRegistry(): Promise<ModuleRegistryEntry[]> {
  const [coreModules, platformClient] = await Promise.all([
    listAllCoreModules(),
    createClient({ schema: "platform" }),
  ]);

  const [modulesResult, planModulesResult, plansResult] = await Promise.all([
    platformClient.from("modules").select("module_key, enabled, visible, status, version, updated_at, updated_by"),
    platformClient.from("plan_modules").select("module_key, enabled, plan_id"),
    platformClient.from("plans").select("id, key, name, display_order, status"),
  ]);
  if (modulesResult.error) throw modulesResult.error;
  if (planModulesResult.error) throw planModulesResult.error;
  if (plansResult.error) throw plansResult.error;

  const byKey = new Map((modulesResult.data as PlatformModuleRow[]).map((row) => [row.module_key, row]));
  const minimumPlanByKey = computeMinimumPlans(
    planModulesResult.data as PlanModuleRow[],
    plansResult.data as PlanRow[],
  );

  return coreModules.map((m) => {
    const row = byKey.get(m.key);
    return {
      moduleKey: m.key,
      moduleName: m.name,
      moduleDescription: m.description,
      enabled: row?.enabled ?? true,
      visible: row?.visible ?? true,
      licensed: true,
      minimumPlan: minimumPlanByKey.get(m.key) ?? null,
      status: row?.status ?? "available",
      version: row?.version ?? null,
      updatedAt: row?.updated_at ?? "",
      updatedBy: row?.updated_by ?? null,
    };
  });
}

const moduleKeySchema = z.string().trim().min(1);

export async function setModuleVisible(
  moduleKey: string,
  visible: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsedKey = moduleKeySchema.safeParse(moduleKey);
  if (!parsedKey.success) return { ok: false, error: "A module key is required." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("modules")
    .update({ visible, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("module_key", parsedKey.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const setModuleMetaSchema = z.object({
  moduleKey: moduleKeySchema,
  status: z.enum(MODULE_STATUSES),
  version: z
    .string()
    .trim()
    .max(50, "Version must be 50 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
});

export type SetModuleMetaInput = { moduleKey: string; status: ModuleStatus; version: string };

export async function setModuleMeta(
  input: SetModuleMetaInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setModuleMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("modules")
    .update({
      status: parsed.data.status,
      version: parsed.data.version,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("module_key", parsed.data.moduleKey);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
