import { createClient } from "../../db/server";
import { listContacts } from "../contacts/queries";
import { getIcpProfile } from "../icp/queries";
import { getProspect } from "../prospects/queries";
import { getProspectResearch } from "../research/queries";
import { detectNegativeSignals } from "./detect";
import { listNegativeSignalsForProspect } from "./queries";
import type { NegativeSignal, NegativeSignalReason } from "./types";

/** The seven reasons `detectNegativeSignals` can ever return -- the exact set
 * `syncNegativeSignalsForProspect` is allowed to add, refresh, or remove. Keeping this
 * list explicit (rather than deriving it from the last detection run) means a sync with
 * zero current findings still only clears rows in this set, never a `manual`-source row
 * for `known_incompatible_solution`/`existing_active_relationship`, which this function
 * has no way to know is still true or false. */
const AUTO_DETECTABLE_REASONS: NegativeSignalReason[] = [
  "wrong_industry",
  "wrong_size",
  "wrong_geography",
  "no_relevant_problem",
  "recent_rejection",
  "no_buyer",
  "insufficient_evidence",
];

/**
 * DISC-OFFER-P0-05.5: gathers the same inputs `detectNegativeSignals` needs (prospect,
 * approved ICP, research, contact count -- all reads this module already has), runs the
 * deterministic detection, then reconciles `discovery.negative_signals` to match: upserts
 * every currently-detected reason (refreshing `detail`/`detected_at` if it already
 * existed) and deletes any `source: 'auto'` row for a reason that is no longer detected
 * -- e.g. the ICP changed and the industry now matches, or a contact was finally added.
 * Never touches `source: 'manual'` rows (`known_incompatible_solution`/
 * `existing_active_relationship`), which this function has no way to (re)detect itself.
 */
export async function syncNegativeSignalsForProspect(workspaceId: string, prospectId: string): Promise<NegativeSignal[]> {
  const [prospect, icp, research, contacts] = await Promise.all([
    getProspect(prospectId),
    getIcpProfile(workspaceId),
    getProspectResearch(prospectId),
    listContacts(prospectId),
  ]);
  if (!prospect) throw new Error("Prospect not found.");

  const detected = detectNegativeSignals({
    prospect: {
      industry: prospect.industry,
      company_size: prospect.company_size,
      location: prospect.location,
      outcome: prospect.outcome,
      updated_at: prospect.updated_at,
    },
    icp: icp ? { status: icp.status, industries: icp.industries, company_sizes: icp.company_sizes, geographies: icp.geographies } : null,
    research: research ? { pain_points: research.pain_points } : null,
    contactCount: contacts.length,
  });

  const supabase = await createClient();
  const detectedReasons = detected.map((d) => d.reason);
  const staleReasons = AUTO_DETECTABLE_REASONS.filter((reason) => !detectedReasons.includes(reason));

  if (staleReasons.length > 0) {
    const { error: deleteError } = await supabase
      .from("negative_signals")
      .delete()
      .eq("prospect_id", prospectId)
      .eq("source", "auto")
      .in("reason", staleReasons);
    if (deleteError) throw deleteError;
  }

  if (detected.length === 0) return listNegativeSignalsForProspect(prospectId);

  const { error: upsertError } = await supabase.from("negative_signals").upsert(
    detected.map((d) => ({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      reason: d.reason,
      detail: d.detail,
      source: "auto" as const,
      detected_at: new Date().toISOString(),
    })),
    { onConflict: "prospect_id,reason" },
  );
  if (upsertError) throw upsertError;

  return listNegativeSignalsForProspect(prospectId);
}

/**
 * The two reasons Discovery cannot detect on its own -- `known_incompatible_solution`
 * (no competitor/tooling knowledge exists anywhere in this module) and
 * `existing_active_relationship` (needs CRM data; DISC-OFFER-P0-08.2 owns real
 * detection). A caller with that context (a founder, or a future story) records it
 * directly rather than Discovery guessing at it. Upserts like the auto path, so
 * recording the same reason again just refreshes the detail.
 */
export async function recordManualNegativeSignal(
  workspaceId: string,
  prospectId: string,
  reason: Extract<NegativeSignalReason, "known_incompatible_solution" | "existing_active_relationship">,
  detail: string,
): Promise<NegativeSignal> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negative_signals")
    .upsert(
      { workspace_id: workspaceId, prospect_id: prospectId, reason, detail, source: "manual", detected_at: new Date().toISOString() },
      { onConflict: "prospect_id,reason" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
