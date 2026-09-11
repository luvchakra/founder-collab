import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createFsmQuoteFromCrmOpportunity, acceptFsmQuoteAndCreateJob, getFsmQuoteStatus } from "@cofounderai/module-fsm/contract/index";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import { listOpportunityProducts } from "./products";
import { DEFAULT_OPPORTUNITY_STAGES } from "./types";
import type { OpportunityStage } from "./types";

/** CRM-04.2: "Stage configuration stored at business level." Lazily provisions the
 * default pipeline the first time a business's Opportunities page is opened -- there's
 * no license-activation hook in this codebase that seeds per-module defaults, and
 * provisioning on first real use avoids needing one. Idempotent: a business that
 * already has any stage rows is left alone (a founder may have already customized
 * them), not reset. */
export async function ensureDefaultStages(businessId: string): Promise<OpportunityStage[]> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("opportunity_stage")
    .select("*")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (existingError) throw existingError;
  if (existing.length > 0) return existing as OpportunityStage[];

  const rows = DEFAULT_OPPORTUNITY_STAGES.map((stage, index) => ({
    business_id: businessId,
    key: stage.key,
    name: stage.name,
    sort_order: index,
    is_won: stage.isWon ?? false,
    is_lost: stage.isLost ?? false,
  }));
  const { data: created, error: createError } = await supabase.from("opportunity_stage").insert(rows).select("*");
  if (createError) throw createError;
  return created as OpportunityStage[];
}

/**
 * CRM-04.2: "Drag/drop stage change with audit event." Also flips `status` to
 * `won`/`lost` when the target stage is terminal, and back to `open` when dragged out
 * of one -- an opportunity's status should never say `won` while sitting in a
 * non-terminal stage or vice versa. Publishes `crm.opportunity.stage_changed`
 * (CRM-01.4) and, on a terminal transition, `crm.opportunity.won`/`crm.opportunity.lost`.
 */
export async function updateOpportunityStage(businessId: string, opportunityId: string, stageId: string): Promise<void> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("stage_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;

  const { data: stage, error: stageError } = await supabase
    .from("opportunity_stage")
    .select("is_won, is_lost")
    .eq("id", stageId)
    .eq("business_id", businessId)
    .single();
  if (stageError) throw stageError;

  const status = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";

  const { error: updateError } = await supabase.from("opportunity").update({ stage_id: stageId, status }).eq("id", opportunityId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.stage_changed",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    before: { stage_id: opportunity.stage_id },
    after: { stage_id: stageId },
  });

  await publishCrmEvent(businessId, "crm.opportunity.stage_changed", {
    v: 1,
    opportunityId,
    fromStageId: opportunity.stage_id,
    toStageId: stageId,
  });
  if (stage.is_won) await publishCrmEvent(businessId, "crm.opportunity.won", { v: 1, opportunityId });
  if (stage.is_lost) await publishCrmEvent(businessId, "crm.opportunity.lost", { v: 1, opportunityId, reason: null });
}

/** CRM-04.3: sets the forecasting fields directly -- no audit/event of their own
 * (unlike stage, these aren't a lifecycle transition the rest of the platform reacts
 * to, just numbers a founder is refining). */
export async function updateOpportunityValue(
  businessId: string,
  opportunityId: string,
  input: { estimatedValue: number | null; currency: string; probability: number | null; expectedCloseDate: string | null },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity")
    .update({
      estimated_value: input.estimatedValue,
      currency: input.currency,
      probability: input.probability,
      expected_close_date: input.expectedCloseDate,
    })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (error) throw error;
}

/** CRM-05.2: designates one activity (already attached to this opportunity) as its
 * next action, or clears it (`activityId: null`). */
export async function setOpportunityNextAction(businessId: string, opportunityId: string, activityId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity")
    .update({ next_action_id: activityId })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (error) throw error;
}

/**
 * CRM-11.1's "Create FSM Quote from Opportunity": line items are this opportunity's own
 * `crm.product_interest` rows (CRM-10.1's schema, already surfaced on this page by
 * `listOpportunityProducts()`) -- "Customer/product context is passed through FSM
 * public contract" happens entirely inside `createFsmQuoteFromCrmOpportunity()`, this
 * function's own job is just resolving what to pass it and recording the one pointer
 * back ("no duplicated quote master in CRM" -- quote status is always re-read live,
 * never copied here).
 */
export async function createFsmQuoteForOpportunity(businessId: string, opportunityId: string): Promise<{ fsmOpportunityId: string; estimateId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("id, party_id, fsm_opportunity_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (opportunity.fsm_opportunity_id) throw new Error("An FSM quote already exists for this opportunity.");

  const products = await listOpportunityProducts(businessId, opportunityId);
  if (products.length === 0) throw new Error("Add at least one product before creating an FSM quote.");

  const result = await createFsmQuoteFromCrmOpportunity(businessId, {
    crmOpportunityId: opportunityId,
    partyId: opportunity.party_id,
    lineItems: products.map((p) => ({ itemId: p.itemId, quantity: p.quantity ?? 1, taxable: true })),
  });
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "FSM isn't licensed for this business." : result.error);

  const { error: updateError } = await supabase
    .from("opportunity")
    .update({ fsm_opportunity_id: result.data.fsmOpportunityId })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fsm_quote_created",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { fsm_opportunity_id: result.data.fsmOpportunityId, estimate_id: result.data.estimateId },
  });

  return result.data;
}

/**
 * CRM-11.3's "Accepted Quote -> Job": "User action: Create Job in FSM." Needs the
 * quote's current `estimateId` to hand to `acceptFsmQuoteAndCreateJob()`, re-read live
 * (same "never copied" discipline `createFsmQuoteForOpportunity()` above follows)
 * rather than trusting a value this function might otherwise have stashed.
 */
export async function createJobFromFsmQuote(businessId: string, opportunityId: string): Promise<{ jobId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("fsm_opportunity_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (!opportunity.fsm_opportunity_id) throw new Error("No FSM quote exists for this opportunity yet.");

  const statusResult = await getFsmQuoteStatus(businessId, opportunity.fsm_opportunity_id);
  if (!statusResult.ok) throw new Error(statusResult.error === "MODULE_NOT_LICENSED" ? "FSM isn't licensed for this business." : statusResult.error);
  if (!statusResult.data.estimateId) throw new Error("This FSM quote has no estimate yet.");

  const result = await acceptFsmQuoteAndCreateJob(businessId, opportunity.fsm_opportunity_id, statusResult.data.estimateId);
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "FSM isn't licensed for this business." : result.error);

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fsm_job_created",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { fsm_job_id: result.data.jobId },
  });

  return result.data;
}
