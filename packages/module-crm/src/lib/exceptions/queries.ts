import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getAssessmentStatus, listJobsWithUnresolvedPartsShortage } from "@cofounderai/module-fsm/contract/index";
import { createClient } from "../../db/server";
import type { CrossModuleException } from "./types";

/**
 * INT-07.1's "Cross-Module Exception Model" resolver -- composes FSM's own business-
 * wide parts-shortage list (a genuinely new read this story adds to FSM's contract,
 * `listJobsWithUnresolvedPartsShortage()`) with CRM's own assessment-gated
 * opportunities (a plain direct query -- `crm.opportunity` is this module's own table,
 * no contract call needed to read it) into one list. Party names resolved in one
 * batched `core.parties` read, same "no PostgREST embed, join in JS" convention every
 * other list query in this codebase already follows (e.g. `jobs/queries.ts#listJobs`).
 */
export async function listCrossModuleExceptions(businessId: string): Promise<CrossModuleException[]> {
  const supabase = await createClient();

  const [shortageResult, gatedOpportunities] = await Promise.all([
    listJobsWithUnresolvedPartsShortage(businessId),
    supabase
      .from("opportunity")
      .select("id, party_id, assessment_requirement, assessment_request_id")
      .eq("business_id", businessId)
      .not("assessment_requirement", "is", null)
      .neq("assessment_requirement", "none"),
  ]);
  if (gatedOpportunities.error) throw gatedOpportunities.error;

  const shortageJobs = shortageResult.ok ? shortageResult.data : [];

  // Of the opportunities with a gate set, only those with no recorded assessment
  // outcome yet are actually pending -- one that already has a real outcome recorded
  // stops being an exception even though its own gate stays set (the exact "no outcome
  // yet" test INT-04.3's own quote-gating check already uses).
  const pending = await Promise.all(
    gatedOpportunities.data.map(async (o) => {
      if (!o.assessment_request_id) return o;
      const result = await getAssessmentStatus(businessId, o.assessment_request_id);
      const hasOutcome = result.ok && Boolean(result.data.outcome);
      return hasOutcome ? null : o;
    }),
  );
  const openAssessments = pending.filter((o): o is (typeof gatedOpportunities.data)[number] => o !== null);

  const core = await createCoreClient({ schema: "core" });
  const partyIds = [...new Set([...shortageJobs.map((j) => j.partyId), ...openAssessments.map((o) => o.party_id)])];
  const { data: parties, error: partiesError } = partyIds.length
    ? await core.from("parties").select("id, name").in("id", partyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  const exceptions: CrossModuleException[] = [];

  for (const job of shortageJobs) {
    exceptions.push({
      id: `fsm_parts_shortage:${job.jobId}`,
      kind: "fsm_parts_shortage",
      module: "fsm",
      label: `${partyNameById.get(job.partyId) ?? "Unknown customer"} -- job short on parts`,
      detail: job.jobNumber,
      detailHref: `/dashboard/businesses/${businessId}/fsm/jobs/${job.jobId}`,
    });
  }

  for (const o of openAssessments) {
    exceptions.push({
      id: `assessment_pending:${o.id}`,
      kind: "assessment_pending",
      module: "crm",
      label: `${partyNameById.get(o.party_id) ?? "Unknown customer"} -- assessment pending`,
      detail: o.assessment_request_id ? "Requested, awaiting outcome" : "Not yet requested",
      detailHref: `/dashboard/businesses/${businessId}/crm/opportunities/${o.id}`,
    });
  }

  return exceptions;
}
