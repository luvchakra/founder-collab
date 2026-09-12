import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { RESOURCE_KEYS, RESOURCE_LABELS, type ResourceKey } from "./platform-limits-constants";

export { RESOURCE_KEYS, RESOURCE_LABELS };
export type { ResourceKey };

/**
 * PLATFORM-P0-04.5/04.6 ("Quantity Limits" + "Unlimited Support",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8): configurable, per-plan numeric
 * ceilings across the 13 resource dimensions the doc names, with a genuine tri-state
 * (limited / unlimited / disabled) rather than an arbitrary huge number standing in for
 * "unlimited". See the migration's own docstring for why these two sub-stories share one
 * table and why the table starts with no rows for any plan.
 *
 * Same authorization shape as `platform-plan-modules.ts`: the request-scoped,
 * cookie-authenticated client, so `platform.plan_limits`' own RLS
 * (`platform.is_superadmin()`) is the authoritative enforcement layer.
 *
 * `RESOURCE_KEYS`/`RESOURCE_LABELS`/`ResourceKey` live in `./platform-limits-constants`
 * (re-exported here) rather than this file, specifically so a Client Component can import
 * them without pulling in this file's own `../db/server` import (which uses
 * `next/headers`, server-only) -- see that file's own docstring.
 */

export type LimitState = "limited" | "unlimited" | "disabled";
const LIMIT_STATES = ["limited", "unlimited", "disabled"] as const;

/**
 * PLATFORM-P0-06.5 decision #2: an independent column, meaningful only when
 * `state = 'limited'` -- see the migration's own docstring
 * (`20260912110000_platform_plan_limits_soft_hard.sql`) for why this does not reinterpret
 * `LimitState`/`state` itself. `null` for `unlimited`/`disabled` rows and for a row that
 * doesn't exist yet (`configured: false`), matching the DB's own CHECK constraint.
 */
export type LimitType = "soft" | "hard";
const LIMIT_TYPES = ["soft", "hard"] as const;

/** One resource dimension's configured state for one plan -- or `configured: false` when
 * no row exists yet, the honest "not yet configured" gap this table's own migration
 * docstring deliberately does not paper over with a fabricated default. */
export type PlanResourceLimit =
  | { resourceKey: ResourceKey; configured: false }
  | {
      resourceKey: ResourceKey;
      configured: true;
      state: LimitState;
      limitValue: number | null;
      limitType: LimitType | null;
      updatedAt: string;
      updatedBy: string | null;
    };

type PlanLimitRow = {
  resource_key: ResourceKey;
  state: LimitState;
  limit_value: number | null;
  limit_type: LimitType | null;
  updated_at: string;
  updated_by: string | null;
};

/** Every resource dimension for one plan, in the doc's own listed order -- configured
 * dimensions carry their real state, unconfigured ones are explicitly marked so, never
 * silently defaulted. */
export async function listPlanLimits(planId: string): Promise<PlanResourceLimit[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("plan_limits")
    .select("resource_key, state, limit_value, limit_type, updated_at, updated_by")
    .eq("plan_id", planId);
  if (error) throw error;

  const byKey = new Map((data as PlanLimitRow[]).map((row) => [row.resource_key, row]));
  return RESOURCE_KEYS.map((key) => {
    const row = byKey.get(key);
    if (!row) return { resourceKey: key, configured: false as const };
    return {
      resourceKey: key,
      configured: true as const,
      state: row.state,
      limitValue: row.limit_value,
      limitType: row.limit_type,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  });
}

export const setPlanLimitSchema = z
  .object({
    state: z.enum(LIMIT_STATES),
    // Coerced from a form field (always a string) -- z.coerce.number() on "" would
    // produce 0, which is a real, meaningful limit (not "no value"), so the empty case is
    // checked before coercion instead of relying on coercion to catch it.
    limitValue: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : Number(v))),
    // PLATFORM-P0-06.5 decision #2: optional on input -- see the `.transform()` below for
    // why a missing value defaults to 'hard' (decision #1's own "unchanged default")
    // rather than being rejected the way an out-of-place `limitValue` is above. There is no
    // meaningful "wrong" limitType once `state` isn't 'limited' either, so it is silently
    // normalized to `null` there rather than erroring on a stray value from a form that
    // didn't clear it after switching away from "Limited".
    limitType: z.enum(LIMIT_TYPES).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.state === "limited") {
      if (val.limitValue === null || Number.isNaN(val.limitValue)) {
        ctx.addIssue({ code: "custom", path: ["limitValue"], message: "Enter a limit, or choose Unlimited or Disabled." });
      } else if (!Number.isInteger(val.limitValue) || val.limitValue < 0) {
        ctx.addIssue({ code: "custom", path: ["limitValue"], message: "Enter a whole number, 0 or greater." });
      }
    } else if (val.limitValue !== null) {
      ctx.addIssue({ code: "custom", path: ["limitValue"], message: "Unlimited and Disabled do not take a numeric value." });
    }
  })
  .transform((val) => ({
    ...val,
    limitType: val.state === "limited" ? (val.limitType ?? ("hard" as const)) : null,
  }));
export type SetPlanLimitInput = z.input<typeof setPlanLimitSchema>;

export async function setPlanLimit(
  planId: string,
  resourceKey: ResourceKey,
  input: SetPlanLimitInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setPlanLimitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid limit." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("plan_limits").upsert(
    {
      plan_id: planId,
      resource_key: resourceKey,
      state: parsed.data.state,
      limit_value: parsed.data.limitValue,
      limit_type: parsed.data.limitType,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,resource_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Reverts one resource dimension back to "not yet configured" -- removing the row
 * entirely, not setting it to any of the three configured states (see the migration's own
 * docstring on why DELETE is granted for this table but not its plan_modules sibling). */
export async function clearPlanLimit(planId: string, resourceKey: ResourceKey): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.from("plan_limits").delete().eq("plan_id", planId).eq("resource_key", resourceKey);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
