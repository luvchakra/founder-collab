import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey, PlatformModuleStatus } from "../licensing/types";

/**
 * PLATFORM-P0-07.1 ("Module Registry", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11),
 * PLATFORM-P0-07.2 ("Platform-Wide Module Kill Switch"), and PLATFORM-P0-07.3 ("Module
 * Maintenance Mode"). `platform.modules` -- see the migration's own docstring for why this
 * is genuinely new (not a duplicate of `core.modules` or `packages/module-registry`) and
 * why `licensed`/`minimum_plan` are computed here rather than stored columns.
 *
 * Same authorization shape as every other `platform.*` admin data-access module in this
 * backlog: the request-scoped, cookie-authenticated client (not `createAdminClient`), so
 * `platform.modules`' own RLS (`platform.is_superadmin()` for writes, open SELECT for any
 * authenticated user) is the authoritative enforcement layer -- `requireSuperadmin()` here
 * is defense-in-depth on every write path, matching every sibling file. The one exception
 * is `getModuleImpact()` below, which deliberately uses `createAdminClient()` -- see its
 * own docstring for why a cross-tenant count needs the service-role client the same way
 * `platform-dashboard-queries.ts` already does.
 *
 * `setModuleStatus()` is the ONE mutation path for `status`/`customer_facing_message` --
 * PLATFORM-P0-07.3's own reconciliation (decision #1) made `enabled` a database-generated
 * column derived from `status`, so there is no longer a separate `setModuleEnabled()`
 * export here at all: a second, parallel app-layer path to the same "every business
 * blocked" real-world effect is exactly the unaudited-back-door risk that decision warned
 * against. `setModuleStatus()` calls `platform.set_module_status()`, the one atomic,
 * SECURITY DEFINER path to changing `status`+`customer_facing_message` together and
 * writing `platform.module_status_events` in the same transaction (see that migration's
 * own docstring) -- a mandatory `reason` on every call, exactly the bar
 * PLATFORM-P0-07.2's own kill switch already set. (`platform.set_module_enabled()`, the
 * PLATFORM-P0-07.2 RPC, still exists in the database as a thin wrapper over
 * `set_module_status()` for any other/future caller -- this file simply doesn't need its
 * own TypeScript wrapper around it anymore now that `setModuleStatus()` covers every
 * status, including `disabled`.)
 */

export type ModuleStatus = PlatformModuleStatus;
const MODULE_STATUSES = ["available", "read_only", "maintenance", "disabled"] as const satisfies readonly ModuleStatus[];

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
  /** The superadmin-set business-visible copy shown instead of (or per decision #4's
   * "optional") the default WonderArc message for this module's current status --
   * PLATFORM-P0-07.3's own "optional customer-facing message." `null` when unset. */
  customerFacingMessage: string | null;
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
  customer_facing_message: string | null;
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
    platformClient
      .from("modules")
      .select("module_key, enabled, visible, status, customer_facing_message, version, updated_at, updated_by"),
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
      customerFacingMessage: row?.customer_facing_message ?? null,
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

const setModuleVersionSchema = z.object({
  moduleKey: moduleKeySchema,
  version: z
    .string()
    .trim()
    .max(50, "Version must be 50 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
});

export type SetModuleVersionInput = { moduleKey: string; version: string };

/** The superadmin-set free-text version label -- see the migration's own docstring for why
 * this is not read from any `package.json` and carries no enforcement meaning. Kept as a
 * plain, unaudited `.update()` (no reason required) -- unlike `status`, a version label
 * has no real-world access effect on any business, so it does not need
 * `setModuleStatus()`'s own audited-mutation bar. Split out from the old, combined
 * `setModuleMeta()` (status + version together) by PLATFORM-P0-07.3's own reconciliation:
 * once `status` gained real behavioral meaning (decisions #1/#3), a plain, reason-free
 * `.update()` could no longer be allowed to also set `status` to `disabled`/`maintenance`
 * -- see `setModuleStatus()` below for the one audited path that still can. */
export async function setModuleVersion(
  input: SetModuleVersionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setModuleVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("modules")
    .update({ version: parsed.data.version, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("module_key", parsed.data.moduleKey);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** PLATFORM-P0-07.2's own "impact confirmation" -- the real, live count of businesses
 * that currently have this module licensed (`active` or `grace`, the same two statuses
 * `core.has_module()`'s own read gate treats as "has access") -- shown to a superadmin
 * before they confirm disabling it, never a fabricated or omitted number. Deliberately
 * uses `createAdminClient()`, not the request-scoped client every other function in this
 * file uses: `core.licenses`' own RLS ("members can view their business licenses") scopes
 * a read to the caller's OWN businesses, and a superadmin is not necessarily a member of
 * any business at all -- the same cross-tenant-by-design reasoning
 * `platform-dashboard-queries.ts`'s own docstring already gives for its own use of the
 * service-role client, applied here to a single count instead of the whole dashboard. */
export async function getModuleImpact(moduleKey: string): Promise<{ affectedBusinessCount: number }> {
  await requireSuperadmin();
  const supabase = createAdminClient({ schema: "core" });
  const { count, error } = await supabase
    .from("licenses")
    .select("id", { count: "exact", head: true })
    .eq("module_key", moduleKey)
    .in("status", ["active", "grace"]);
  if (error) throw error;
  return { affectedBusinessCount: count ?? 0 };
}

const setModuleStatusSchema = z.object({
  moduleKey: moduleKeySchema,
  status: z.enum(MODULE_STATUSES),
  message: z
    .string()
    .trim()
    .max(2000, "Message must be 2000 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
  reason: z.string().trim().min(1, "A reason is required.").max(500, "Reason must be 500 characters or fewer."),
});

export type SetModuleStatusInput = { moduleKey: string; status: ModuleStatus; message: string; reason: string };

/** PLATFORM-P0-07.2/07.3 -- the ONE mutation path for `platform.modules.status` and
 * `customer_facing_message`, for every one of the four statuses (not only
 * `disabled`/`maintenance`) -- PLATFORM-P0-07.3's own reconciliation (decision #1) means
 * there is no separate, lighter, unaudited path to `disabled`/`maintenance` anymore, and
 * decision #4 means a message change is audited exactly like a status change is, so both
 * fields go through the one call. Calls `platform.set_module_status()` (the atomic,
 * SECURITY DEFINER RPC that changes both fields AND writes
 * `platform.module_status_events` together, capturing the full previous/new snapshot of
 * each -- see that migration's own docstring) rather than a plain `.update()`, so a reason
 * is structurally required for every transition, not merely validated client-side --
 * exactly the bar PLATFORM-P0-07.2's own kill switch already set for its own boolean flip.
 * `requireSuperadmin()` here is defense-in-depth on top of the RPC's own internal
 * `platform.is_superadmin()` check (the function bypasses RLS via SECURITY DEFINER, so it
 * re-checks itself) -- the same "two independent checks" relationship every other write in
 * this file already has with its own RLS policy.
 *
 * The admin UI (`ModuleStatusDialog`) shows the live impact count and requires an explicit
 * acknowledgement checkbox whenever the transition enters or leaves a fully-blocked status
 * (`maintenance`/`disabled`) -- §11's own "impact confirmation"/"explicit confirmation"
 * halves, which stay UI-layer concerns exactly as PLATFORM-P0-07.2's own kill switch
 * dialog already established (this function's own mandatory `reason` and the RPC's atomic
 * audit write are the "reason"/"audit record" halves). */
export async function setModuleStatus(
  input: SetModuleStatusInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setModuleStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_module_status", {
    p_module_key: parsed.data.moduleKey,
    p_status: parsed.data.status,
    p_message: parsed.data.message,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
