import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { getProspectResearch } from "../research/queries";
import type { ProspectScore } from "./types";

/**
 * ICP Fit 50% / Intent 25% / Timing 25% (blueprint §17's 40/25/20/15 example includes a
 * "reachability" component that isn't a column in the prospect_scores schema -- see
 * docs/engineering-blueprint.md §9 -- so its weight is folded into ICP fit here).
 *
 * Entirely deterministic, no AI call: "AI can provide qualitative reasoning but should
 * not unnecessarily calculate simple mathematics" (blueprint §17). Intent/timing come
 * from counting signals a prior researchProspect() run already extracted -- scoring
 * itself doesn't call the model.
 */
export const WEIGHTS = { icp: 0.5, intent: 0.25, timing: 0.25 };

function fuzzyIncludes(haystack: string[], needle: string | null): boolean {
  if (!needle) return false;
  const normalized = needle.toLowerCase();
  return haystack.some(
    (item) =>
      item.toLowerCase().includes(normalized) || normalized.includes(item.toLowerCase()),
  );
}

export async function scoreProspect(prospectId: string): Promise<ProspectScore> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const icp = await getIcpProfile(workspace.id);
  if (!icp || icp.status !== "approved") {
    throw new Error("Approve an ICP before scoring prospects.");
  }

  const research = await getProspectResearch(prospectId);
  const reasoning: string[] = [];

  const icpChecks: [boolean, string][] = [
    [
      fuzzyIncludes(icp.industries, prospect.industry),
      `Industry (${prospect.industry ?? "unset"})`,
    ],
    [
      fuzzyIncludes(icp.company_sizes, prospect.company_size),
      `Company size (${prospect.company_size ?? "unset"})`,
    ],
    [
      fuzzyIncludes(icp.geographies, prospect.location),
      `Location (${prospect.location ?? "unset"})`,
    ],
  ];
  const icpMatches = icpChecks.filter(([match]) => match).length;
  for (const [match, label] of icpChecks) {
    reasoning.push(`${match ? "+" : "-"} ${label} ${match ? "matches" : "does not match"} ICP`);
  }
  const icpScore = Math.round((icpMatches / icpChecks.length) * 100);

  const intentScore = research ? Math.min(100, research.buying_signals.length * 25) : 0;
  reasoning.push(
    research
      ? research.buying_signals.length > 0
        ? `+ ${research.buying_signals.length} buying signal(s) found in research`
        : "- No buying signals found in research"
      : "- No research yet -- intent unknown",
  );

  const timingScore = research ? Math.min(100, research.recent_events.length * 25) : 0;
  reasoning.push(
    research
      ? research.recent_events.length > 0
        ? `+ ${research.recent_events.length} recent event(s) found`
        : "- No recent events found"
      : "- No research yet -- timing unknown",
  );

  const overallScore = Math.round(
    icpScore * WEIGHTS.icp + intentScore * WEIGHTS.intent + timingScore * WEIGHTS.timing,
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_scores")
    // Append-only (docs/prospects-pipeline-redesign-requirements.md R8) -- a rescore is
    // a new row, not an overwrite, so getProspectScore's "latest" and the detail page's
    // previous-vs-current trend both have something to read.
    .insert({
      workspace_id: workspace.id,
      prospect_id: prospect.id,
      icp_score: icpScore,
      intent_score: intentScore,
      timing_score: timingScore,
      overall_score: overallScore,
      reasoning: reasoning.join("\n"),
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("prospects").update({ fit_score: overallScore }).eq("id", prospect.id);

  return data;
}
