/**
 * PLATFORM-P1-08.2 ("Feature Rollout") / PLATFORM-P1-08.3 ("Rollback Flag") -- the
 * client-safe part: stage names, order and labels. No server or Node imports, so the
 * feature-flag dialogs can use it. Evaluation and writes live in
 * `platform-feature-rollout.ts`; the database is authoritative
 * (`20261017130000_platform_feature_flag_rollout.sql`).
 *
 * Stages are cumulative -- each adds to the one before it:
 *   internal        only the named businesses
 *   pilot           named businesses + a percentage of all businesses
 *   selected_plans  pilot + every business on the chosen plans
 *   all             every business
 */

export const ROLLOUT_STAGES = ["internal", "pilot", "selected_plans", "all"] as const;
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

export const ROLLOUT_STAGE_LABELS: Record<RolloutStage, string> = {
  internal: "Internal",
  pilot: "Pilot",
  selected_plans: "Selected Plans",
  all: "All Customers",
};

export type FeatureRollout = {
  stage: RolloutStage;
  /** 0-100; counts from Pilot on. */
  percentage: number;
  /** The named businesses (allow-list); always included from Internal on. */
  businessIds: string[];
  /** Plan keys; counts at Selected Plans. */
  planKeys: string[];
};

export function isRolloutStage(value: unknown): value is RolloutStage {
  return typeof value === "string" && (ROLLOUT_STAGES as readonly string[]).includes(value);
}

/** The next stage, or null at All Customers. */
export function nextRolloutStage(stage: RolloutStage): RolloutStage | null {
  const i = ROLLOUT_STAGES.indexOf(stage);
  return i >= 0 && i < ROLLOUT_STAGES.length - 1 ? (ROLLOUT_STAGES[i + 1] ?? null) : null;
}

export function isLaterStage(candidate: RolloutStage, current: RolloutStage): boolean {
  return ROLLOUT_STAGES.indexOf(candidate) > ROLLOUT_STAGES.indexOf(current);
}

/** One-line description of who a rollout reaches, e.g. "Pilot -- 3 businesses + 10%". */
export function rolloutSummary(rollout: FeatureRollout): string {
  const label = ROLLOUT_STAGE_LABELS[rollout.stage];
  if (rollout.stage === "all") return label;
  const parts: string[] = [];
  if (rollout.businessIds.length > 0) {
    parts.push(`${rollout.businessIds.length} ${rollout.businessIds.length === 1 ? "business" : "businesses"}`);
  }
  if (rollout.stage !== "internal" && rollout.percentage > 0) parts.push(`${rollout.percentage}%`);
  if (rollout.stage === "selected_plans" && rollout.planKeys.length > 0) parts.push(rollout.planKeys.join(", "));
  return parts.length > 0 ? `${label} -- ${parts.join(" + ")}` : `${label} -- nobody yet`;
}

/** Reads a saved `last_good_rollout` snapshot (or an event's JSONB row) back into a
 * rollout; null when it is missing or malformed. */
export function rolloutFromSnapshot(snapshot: unknown): FeatureRollout | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (!isRolloutStage(s.rollout_stage)) return null;
  const percentage = Number(s.rollout_percentage ?? 0);
  return {
    stage: s.rollout_stage,
    percentage: Number.isFinite(percentage) ? percentage : 0,
    businessIds: Array.isArray(s.rollout_business_ids) ? s.rollout_business_ids.map(String) : [],
    planKeys: Array.isArray(s.rollout_plan_keys) ? s.rollout_plan_keys.map(String) : [],
  };
}
