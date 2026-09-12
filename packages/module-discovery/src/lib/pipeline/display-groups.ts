import { PIPELINE_STAGE_KEYS, type PipelineStage, type PipelineStageKey } from "./types";

/** DISC-OFFER-P0-10.3: "Pipeline Progress UI" -- the doc's own mockup shows nine
 * non-technical lines (Website Understanding / Offering Profile / ICP / Buyer Personas /
 * Discovery Strategy / Signal Intelligence / Opportunity Scoring / Research / Recommended
 * Action), not DISC-OFFER-P0-10.2's own fourteen persisted technical stage keys --
 * grouping several technical stages under one founder-facing label ("Signal
 * Intelligence" = finding accounts, collecting their signals, and correlating them;
 * "Research" = deep research plus identifying the buying committee it also produces;
 * "Recommended Action" = the recommendation plus preparing it for CRM handoff). This is
 * a presentation-layer grouping only -- the persisted state underneath
 * (`discovery.pipeline_stages`) stays exactly as granular as DISC-OFFER-P0-10.2 built it,
 * and each group's own "Retry" still targets the one technical stage that actually
 * failed, not the whole group. */
export type DisplayGroupKey =
  | "website_understanding"
  | "offering_profile"
  | "icp"
  | "buyer_personas"
  | "discovery_strategy"
  | "signal_intelligence"
  | "opportunity_scoring"
  | "research"
  | "recommended_action";

export const PIPELINE_DISPLAY_GROUPS: { key: DisplayGroupKey; label: string; stageKeys: PipelineStageKey[] }[] = [
  { key: "website_understanding", label: "Website Understanding", stageKeys: ["website_understanding"] },
  { key: "offering_profile", label: "Offering Profile", stageKeys: ["offering_profile"] },
  { key: "icp", label: "ICP", stageKeys: ["icp"] },
  { key: "buyer_personas", label: "Buyer Personas", stageKeys: ["buyer_personas"] },
  { key: "discovery_strategy", label: "Discovery Strategy", stageKeys: ["discovery_strategy"] },
  { key: "signal_intelligence", label: "Signal Intelligence", stageKeys: ["account_discovery", "signals", "signal_correlation"] },
  { key: "opportunity_scoring", label: "Opportunity Scoring", stageKeys: ["opportunity_scoring", "why_now"] },
  { key: "research", label: "Research", stageKeys: ["research", "buyer_intelligence"] },
  { key: "recommended_action", label: "Recommended Action", stageKeys: ["recommended_action", "crm_handoff"] },
];

// Every technical stage key must appear in exactly one display group -- a stage left out
// would silently vanish from the progress UI, and a stage in two groups would show
// contradictory statuses. Checked once, at module load, rather than trusted by hand.
const coveredKeys = PIPELINE_DISPLAY_GROUPS.flatMap((g) => g.stageKeys);
if (coveredKeys.length !== PIPELINE_STAGE_KEYS.length || new Set(coveredKeys).size !== PIPELINE_STAGE_KEYS.length) {
  throw new Error("PIPELINE_DISPLAY_GROUPS must cover every pipeline stage key exactly once.");
}

export type DisplayGroupStatus = "completed" | "failed" | "current" | "upcoming";

export type DisplayGroupView = {
  key: DisplayGroupKey;
  label: string;
  status: DisplayGroupStatus;
  stageKeys: PipelineStageKey[];
  /** The one technical stage actually running or failed within this group, when
   * `status` is `current`/`failed` -- what a "Retry"/spinner in the UI targets. Null once
   * `completed` (nothing to point at) or while still `upcoming` (nothing has started). */
  activeStageKey: PipelineStageKey | null;
};

function stageStatus(stages: PipelineStage[], key: PipelineStageKey) {
  return stages.find((s) => s.stage_key === key)?.status ?? "not_started";
}

/** Deterministic, no AI call (CLAUDE.md dev principle #4/#5) -- a plain reduction over
 * already-persisted stage statuses. A group is `failed` if any of its stages failed,
 * `completed` only once every one of its stages is `completed` or `skipped`, and
 * `current` for the *first* group that is neither -- exactly one group is ever `current`
 * at a time (mirroring the mockup's own single "●" line), matching
 * `run-ai-discovery-panel.tsx`'s own `firstIncompleteIndex` logic one level up. */
export function computeDisplayGroups(stages: PipelineStage[]): DisplayGroupView[] {
  let currentAssigned = false;
  return PIPELINE_DISPLAY_GROUPS.map((group) => {
    const statuses = group.stageKeys.map((key) => stageStatus(stages, key));
    const failedStage = group.stageKeys.find((key) => stageStatus(stages, key) === "failed");
    const runningStage = group.stageKeys.find((key) => stageStatus(stages, key) === "running");
    const allDone = statuses.every((s) => s === "completed" || s === "skipped");

    if (failedStage) {
      currentAssigned = true;
      return { key: group.key, label: group.label, status: "failed" as const, stageKeys: group.stageKeys, activeStageKey: failedStage };
    }
    if (allDone) {
      return { key: group.key, label: group.label, status: "completed" as const, stageKeys: group.stageKeys, activeStageKey: null };
    }
    if (!currentAssigned) {
      currentAssigned = true;
      const nextStage = group.stageKeys.find((key) => stageStatus(stages, key) !== "completed" && stageStatus(stages, key) !== "skipped");
      return {
        key: group.key,
        label: group.label,
        status: "current" as const,
        stageKeys: group.stageKeys,
        activeStageKey: runningStage ?? nextStage ?? null,
      };
    }
    return { key: group.key, label: group.label, status: "upcoming" as const, stageKeys: group.stageKeys, activeStageKey: null };
  });
}
