import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-04.3 ("Module Entitlements", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §8): "Configure which modules each plan includes." `platform.plan_modules` -- see the
 * migration's own docstring for why every (plan, module) pair has a row (seeded
 * `enabled = true`) rather than a sparse override table.
 *
 * Same authorization shape as `platform-plans.ts`: the request-scoped,
 * cookie-authenticated client (not `createAdminClient`), so `platform.plan_modules`' own
 * RLS (`platform.is_superadmin()`) is the authoritative enforcement layer.
 */

export type PlanModuleEntitlement = {
  moduleKey: ModuleKey;
  moduleName: string;
  moduleDescription: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

type ModuleRow = { key: ModuleKey; name: string; description: string | null };
type PlanModuleRow = { module_key: ModuleKey; enabled: boolean; updated_at: string; updated_by: string | null };

/** Every module in the platform's catalog, per `core.modules` -- the same table
 * `core.licenses.module_key` itself references, not a parallel list invented for
 * `platform`. Readable by any authenticated user (see core.modules' own RLS policy), so a
 * plain `core`-schema client is enough -- no admin bypass needed for this read. */
async function listAllModules(): Promise<ModuleRow[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("modules").select("key, name, description").order("key");
  if (error) throw error;
  return data as ModuleRow[];
}

/** Every module's entitlement state for one plan, joined with the module catalog for
 * display -- two schema-scoped queries merged in application code rather than a single
 * PostgREST embed, since `platform.plan_modules` and `core.modules` aren't exposed to the
 * same request's schema (each Supabase client is pinned to one `db.schema`). */
export async function listPlanModuleEntitlements(planId: string): Promise<PlanModuleEntitlement[]> {
  await requireSuperadmin();
  const [modules, supabase] = await Promise.all([listAllModules(), createClient({ schema: "platform" })]);
  const { data, error } = await supabase
    .from("plan_modules")
    .select("module_key, enabled, updated_at, updated_by")
    .eq("plan_id", planId);
  if (error) throw error;

  const byKey = new Map((data as PlanModuleRow[]).map((row) => [row.module_key, row]));
  return modules.map((m) => {
    const row = byKey.get(m.key);
    return {
      moduleKey: m.key,
      moduleName: m.name,
      moduleDescription: m.description,
      enabled: row?.enabled ?? true,
      updatedAt: row?.updated_at ?? "",
      updatedBy: row?.updated_by ?? null,
    };
  });
}

const moduleKeySchema = z.string().trim().min(1);

export async function setPlanModuleEnabled(
  planId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsedKey = moduleKeySchema.safeParse(moduleKey);
  if (!parsedKey.success) return { ok: false, error: "A module key is required." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every plan is seeded with one row per module at plan-creation time (see
  // createPlatformPlan's own note in platform-plans.ts), so this is always an UPDATE in
  // practice -- upsert only as a defensive fallback for a plan created before this table
  // existed, or a module added to core.modules after this plan's own rows were seeded.
  const { error } = await supabase.from("plan_modules").upsert(
    {
      plan_id: planId,
      module_key: parsedKey.data,
      enabled,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,module_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Called once, right after a new plan row is inserted (see `createPlatformPlan`), so the
 * new plan starts with the same "every module enabled" default the migration's own seed
 * gave every plan that existed at migration time -- never a plan with silently missing
 * entitlement rows. */
export async function seedPlanModuleEntitlements(planId: string): Promise<void> {
  const modules = await listAllModules();
  if (modules.length === 0) return;
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.from("plan_modules").insert(
    modules.map((m) => ({ plan_id: planId, module_key: m.key, enabled: true })),
  );
  if (error) throw error;
}
