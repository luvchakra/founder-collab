import { PIPELINE_STAGE_KEYS, type PipelineStageKey } from "./types";

/**
 * DISC-OFFER-P0-11.3: "Stage Dependency Graph" -- the doc's own literal ASCII diagram,
 * transcribed as data (parent stages each key depends on). Followed the diagram exactly
 * rather than the more elaborate lineage `lib/pipeline/handlers.ts`'s own comments
 * describe informally (e.g. `buyer_intelligence` arguably also depends on
 * `buyer_personas` for matching) -- the diagram deliberately leaves `buyer_personas` a
 * dead-end branch off `icp` with no further downstream edge, and this graph is this
 * story's own explicit deliverable, not a place to freelance a richer graph the doc
 * doesn't ask for (CLAUDE.md dev principle #7). `buyer_intelligence` (this module's own
 * fourteenth technical key, folded into the diagram's coarser "Research" node) depends on
 * `research`, mirroring `lib/pipeline/display-groups.ts`'s own grouping of the two.
 */
export const STAGE_DEPENDENCIES: Record<PipelineStageKey, PipelineStageKey[]> = {
  website_understanding: [],
  offering_profile: ["website_understanding"],
  icp: ["offering_profile"],
  buyer_personas: ["icp"],
  discovery_strategy: ["icp"],
  account_discovery: ["discovery_strategy"],
  signals: ["account_discovery"],
  signal_correlation: ["signals"],
  opportunity_scoring: ["signal_correlation"],
  why_now: ["opportunity_scoring"],
  research: ["opportunity_scoring"],
  buyer_intelligence: ["research"],
  recommended_action: ["why_now", "buyer_intelligence"],
  crm_handoff: ["recommended_action"],
};

// Every stage key must have an entry, and every listed dependency must itself be a real
// stage key -- checked once at module load rather than trusted by hand (the same
// discipline `display-groups.ts`'s own coverage assertion already established).
for (const key of PIPELINE_STAGE_KEYS) {
  if (!(key in STAGE_DEPENDENCIES)) throw new Error(`STAGE_DEPENDENCIES is missing an entry for "${key}".`);
}
for (const [key, parents] of Object.entries(STAGE_DEPENDENCIES)) {
  for (const parent of parents) {
    if (!PIPELINE_STAGE_KEYS.includes(parent)) throw new Error(`STAGE_DEPENDENCIES["${key}"] names unknown stage "${parent}".`);
  }
}

/**
 * Every stage transitively downstream of `stageKey` (not including itself), in the
 * pipeline's own execution order -- "only affected downstream stages should rerun"
 * (11.3's own line) means a caller needs exactly this set, not the whole pipeline and not
 * a guess. Plain breadth-first traversal over the reversed edges above; deterministic, no
 * AI call (CLAUDE.md dev principle #4).
 */
export function downstreamOf(stageKey: PipelineStageKey): PipelineStageKey[] {
  const affected = new Set<PipelineStageKey>();
  let frontier = [stageKey];
  while (frontier.length > 0) {
    const next: PipelineStageKey[] = [];
    for (const key of PIPELINE_STAGE_KEYS) {
      if (affected.has(key)) continue;
      if (STAGE_DEPENDENCIES[key].some((parent) => frontier.includes(parent))) {
        affected.add(key);
        next.push(key);
      }
    }
    frontier = next;
  }
  return PIPELINE_STAGE_KEYS.filter((key) => affected.has(key));
}
