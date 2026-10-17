import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { ROLLOUT_STAGES, type FeatureRollout } from "./platform-feature-rollout-rules";

/**
 * PLATFORM-P1-08.2 ("Feature Rollout") and PLATFORM-P1-08.3 ("Rollback Flag"),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §30. See
 * `20261017130000_platform_feature_flag_rollout.sql` for the model; the database is the
 * authority for both writes and evaluation.
 *
 * Writes go through `platform.set_feature_flag_rollout()` / `platform.rollback_feature_flag()`
 * (superadmin-only, reason required, one `feature_flag_events` row each, which the Audit
 * and Config History pages already read). `requireSuperadmin()` here is defense in depth.
 */

/** Deterministic rollout bucket (0-99): the first 32 bits of
 * sha256(featureKey + ":" + businessId), mod 100. Identical to SQL
 * `platform.feature_rollout_bucket()`; the DB test checks they agree. */
export function rolloutBucket(featureKey: string, businessId: string): number {
  const hex = createHash("sha256").update(`${featureKey}:${businessId}`, "utf8").digest("hex");
  return parseInt(hex.slice(0, 8), 16) % 100;
}

/**
 * Whether a business falls inside a flag's rollout (the rollout part of
 * `platform.is_feature_enabled_for_business()` only -- enabled/window/scope are checked
 * there too). Stages are cumulative; the allow-list counts at every stage.
 */
export function isBusinessInRollout(
  featureKey: string,
  rollout: FeatureRollout,
  business: { id: string; planKey: string | null },
): boolean {
  if (rollout.stage === "all") return true;
  if (rollout.businessIds.includes(business.id)) return true;
  if (
    (rollout.stage === "pilot" || rollout.stage === "selected_plans") &&
    rolloutBucket(featureKey, business.id) < rollout.percentage
  ) {
    return true;
  }
  if (rollout.stage === "selected_plans" && business.planKey !== null && rollout.planKeys.includes(business.planKey)) {
    return true;
  }
  return false;
}

/**
 * Is `featureKey` on for this business right now? Asks the database
 * (`platform.is_feature_enabled_for_business()`), which checks enabled, the effective
 * window, scope and rollout, and only answers for a business the signed-in user belongs
 * to. Fails closed: any error or unexpected answer is `false`.
 */
export async function isFeatureEnabledForBusiness(featureKey: string, businessId: string): Promise<boolean> {
  try {
    const supabase = await createClient({ schema: "platform" });
    const { data, error } = await supabase.rpc("is_feature_enabled_for_business", {
      p_feature_key: featureKey,
      p_business_id: businessId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Business slugs typed one per line (commas and spaces also separate them). */
function parseSlugList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export const setFeatureFlagRolloutSchema = z
  .object({
    id: z.string().uuid(),
    stage: z.enum(ROLLOUT_STAGES),
    percentage: z.coerce
      .number()
      .int("Use a whole number.")
      .min(0, "Use 0 to 100.")
      .max(100, "Use 0 to 100."),
    businessSlugs: z
      .string()
      .max(20000, "Too many businesses.")
      .transform(parseSlugList)
      .refine((list) => list.length <= 500, "At most 500 named businesses."),
    planKeys: z.array(z.string().trim().min(1)).max(50),
    reason: reasonSchema,
  })
  .transform((v) => ({
    ...v,
    // Same normalisation the database applies: no percentage at Internal, plans only from
    // Selected Plans on.
    percentage: v.stage === "internal" ? 0 : v.percentage,
    planKeys: v.stage === "internal" || v.stage === "pilot" ? [] : [...new Set(v.planKeys)],
  }))
  .superRefine((v, ctx) => {
    if (v.stage === "selected_plans" && v.planKeys.length === 0) {
      ctx.addIssue({ code: "custom", path: ["planKeys"], message: "Choose at least one plan." });
    }
  });
export type SetFeatureFlagRolloutInput = z.input<typeof setFeatureFlagRolloutSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function setFeatureFlagRollout(input: SetFeatureFlagRolloutInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = setFeatureFlagRolloutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  let businessIds: string[] = [];
  if (parsed.data.businessSlugs.length > 0) {
    const { data, error } = await createAdminClient({ schema: "core" })
      .from("business_settings")
      .select("business_id, slug")
      .in("slug", parsed.data.businessSlugs);
    if (error) return { ok: false, error: "Couldn't look up those businesses. Nothing was changed." };
    const idBySlug = new Map((data ?? []).map((r) => [String(r.slug), String(r.business_id)]));
    const unknown = parsed.data.businessSlugs.filter((s) => !idBySlug.has(s));
    if (unknown.length > 0) {
      const message = `No business with slug ${unknown.map((s) => `"${s}"`).join(", ")}.`;
      return { ok: false, error: message, fieldErrors: { businessSlugs: message } };
    }
    businessIds = parsed.data.businessSlugs.map((s) => idBySlug.get(s)!);
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_feature_flag_rollout", {
    p_id: parsed.data.id,
    p_stage: parsed.data.stage,
    p_percentage: parsed.data.percentage,
    p_business_ids: businessIds,
    p_plan_keys: parsed.data.planKeys,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const rollbackSchema = z.object({ id: z.string().uuid(), reason: reasonSchema });
export type RollbackFeatureFlagInput = z.input<typeof rollbackSchema>;

/** PLATFORM-P1-08.3: restores the last known-good rollout, or turns the flag off when no
 * earlier rollout is saved. */
export async function rollbackFeatureFlag(input: RollbackFeatureFlagInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = rollbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("rollback_feature_flag", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
