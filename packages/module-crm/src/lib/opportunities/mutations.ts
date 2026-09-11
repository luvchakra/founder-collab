import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createFsmQuoteFromCrmOpportunity,
  acceptFsmQuoteAndCreateJob,
  getFsmQuoteStatus,
  createFsmAssessmentFromCrmOpportunity,
  getAssessmentStatus,
} from "@cofounderai/module-fsm/contract/index";
import { createFulfillmentRequest } from "@cofounderai/module-inventory/contract/index";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { getPrimaryAddress } from "@cofounderai/core/addresses/queries";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import { listOpportunityContacts } from "./contacts";
import { listOpportunityProducts } from "./products";
import { checkOpportunityFulfillmentAvailability, type LineAvailability } from "./availability";
import { createOutOfStockWaitlist } from "../conversations/products";
import { DEFAULT_OPPORTUNITY_STAGES } from "./types";
import type { AssessmentRequirement, OpportunityStage } from "./types";

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
    .select("id, party_id, fsm_opportunity_id, assessment_requirement, assessment_request_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (opportunity.fsm_opportunity_id) throw new Error("An FSM quote already exists for this opportunity.");

  const requirement = opportunity.assessment_requirement as AssessmentRequirement | null;
  let assessmentOutcome: string | null = null;
  if (requirement && requirement !== "none") {
    if (!opportunity.assessment_request_id) throw new Error("Complete the required assessment before creating an FSM quote.");
    const assessmentStatus = await getAssessmentStatus(businessId, opportunity.assessment_request_id);
    if (!assessmentStatus.ok || !assessmentStatus.data.outcome) {
      throw new Error("The required assessment hasn't been completed yet.");
    }
    assessmentOutcome = assessmentStatus.data.outcomeNotes || assessmentStatus.data.outcome.replace(/_/g, " ");
  }

  const products = await listOpportunityProducts(businessId, opportunityId);
  if (products.length === 0) throw new Error("Add at least one product before creating an FSM quote.");

  // INT-04.4: "No manual re-entry of customer/service-location data" -- the same
  // contact/address resolution `createAssessmentRequestForOpportunity()` already uses,
  // reused here so the quote doesn't leave the founder re-picking what's already on
  // file (whether or not an assessment ever happened for this opportunity).
  const [contacts, serviceAddress] = await Promise.all([listOpportunityContacts(businessId, opportunityId), getPrimaryAddress(opportunity.party_id, "service")]);
  const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;

  const result = await createFsmQuoteFromCrmOpportunity(businessId, {
    crmOpportunityId: opportunityId,
    partyId: opportunity.party_id,
    contactId: primaryContact?.partyContactId ?? null,
    serviceAddressId: serviceAddress?.id ?? null,
    description: assessmentOutcome,
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

/**
 * INT-02.2's "Create Inventory Fulfillment/Reservation Request" button. Idempotent the
 * same way `createFsmQuoteForOpportunity()` above is: an opportunity that already has a
 * `fulfillment_request_id` just returns it rather than creating a second request
 * ("Duplicate requests are prevented"); a request that fails (inventory unlicensed, a
 * transient error) leaves the column unset, so this function is safely retryable by
 * calling it again ("Failed request is retryable").
 */
export async function createFulfillmentRequestForOpportunity(businessId: string, opportunityId: string): Promise<{ fulfillmentRequestId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("id, party_id, fulfillment_request_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (opportunity.fulfillment_request_id) return { fulfillmentRequestId: opportunity.fulfillment_request_id };

  const products = await listOpportunityProducts(businessId, opportunityId);
  if (products.length === 0) throw new Error("Add at least one product before requesting fulfillment.");

  const result = await createFulfillmentRequest(businessId, {
    partyId: opportunity.party_id,
    lineItems: products.map((p) => ({ itemId: p.itemId, quantity: p.quantity ?? 1 })),
  });
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "Inventory isn't licensed for this business." : result.error);

  const { error: updateError } = await supabase
    .from("opportunity")
    .update({ fulfillment_request_id: result.data.fulfillmentRequestId })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fulfillment_requested",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { fulfillment_request_id: result.data.fulfillmentRequestId },
  });

  return { fulfillmentRequestId: result.data.fulfillmentRequestId };
}

/**
 * INT-05.3's "Shortage -> Customer Follow-up": "Create a CRM follow-up tied to the
 * exact inventory shortage... When the shortage clears, existing replenishment workflow
 * can resume rather than creating a second duplicate opportunity." Reuses CRM-10.3's own
 * `createOutOfStockWaitlist()` verbatim per short line -- an opportunity's short product
 * line *is* an out-of-stock product interest, and that function is already idempotent
 * per `product_interest_id` and already wired to CRM-10.4's replenishment handler, so
 * there's no second mechanism to build here, just this new caller.
 */
async function createShortageFollowUpsForOpportunity(businessId: string, lines: LineAvailability[]): Promise<void> {
  const shortLines = lines.filter((line) => line.status !== "available");
  await Promise.all(shortLines.map((line) => createOutOfStockWaitlist(businessId, line.productInterestId)));
}

/**
 * INT-05.1's "fulfill available quantity" decision -- creates a fulfillment request
 * scoped to only what Inventory can supply right now (each line capped at its own
 * available quantity; a line with none is dropped entirely), rather than the full
 * requested quantities `createFulfillmentRequestForOpportunity()` above assumes are all
 * in stock. Availability is recomputed here rather than trusting whatever the page last
 * rendered -- stock can move between page load and this submit. Same idempotent-by-
 * stored-pointer shape as the full-quantity path.
 */
export async function fulfillAvailableQuantityForOpportunity(businessId: string, opportunityId: string): Promise<{ fulfillmentRequestId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("id, party_id, fulfillment_request_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (opportunity.fulfillment_request_id) return { fulfillmentRequestId: opportunity.fulfillment_request_id };

  const products = await listOpportunityProducts(businessId, opportunityId);
  if (products.length === 0) throw new Error("Add at least one product before requesting fulfillment.");

  const availability = await checkOpportunityFulfillmentAvailability(businessId, products);
  const lineItems = availability.lines
    .filter((line) => line.availableQuantity > 0)
    .map((line) => ({ itemId: line.itemId, quantity: Math.min(line.requestedQuantity, line.availableQuantity) }));
  if (lineItems.length === 0) throw new Error("Nothing is available to fulfill right now.");

  const result = await createFulfillmentRequest(businessId, { partyId: opportunity.party_id, lineItems });
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "Inventory isn't licensed for this business." : result.error);

  const { error: updateError } = await supabase
    .from("opportunity")
    .update({ fulfillment_request_id: result.data.fulfillmentRequestId })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (updateError) throw updateError;

  // INT-05.3: whatever this request couldn't cover (a backordered line's remainder, an
  // unavailable line dropped entirely) gets its own tracked follow-up rather than
  // silently disappearing once the partial request is in.
  await createShortageFollowUpsForOpportunity(businessId, availability.lines);

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fulfillment_partial_requested",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { fulfillment_request_id: result.data.fulfillmentRequestId, lines: lineItems },
  });

  return { fulfillmentRequestId: result.data.fulfillmentRequestId };
}

/**
 * INT-05.1's "wait for complete quantity" decision -- makes no change to the
 * opportunity's own commercial data (no request created, no quantity touched); the
 * audit entry is what keeps this "not silent" per the story's own "Do not silently
 * alter the opportunity" wording. Choosing to wait is a recorded decision, not the
 * absence of one. INT-05.3 adds the one real side effect this decision should have: a
 * tracked follow-up per short line (`createShortageFollowUpsForOpportunity()`), same as
 * the "fulfill available quantity" path -- here *every* line is still short, since
 * nothing was fulfilled.
 */
export async function recordFulfillmentWaitDecision(businessId: string, opportunityId: string): Promise<void> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const products = await listOpportunityProducts(businessId, opportunityId);
  const availability = await checkOpportunityFulfillmentAvailability(businessId, products);
  await createShortageFollowUpsForOpportunity(businessId, availability.lines);

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fulfillment_wait_selected",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { decision: "wait_for_complete_quantity" },
  });
}

/**
 * INT-04.2's "Create FSM Assessment Request" -- same idempotent-by-stored-pointer shape
 * as `createFulfillmentRequestForOpportunity()` above: an opportunity that already has
 * `assessment_request_id` returns it rather than creating a second one. Requires
 * INT-04.1's own gate to already say something other than `none`/unset -- this function
 * doesn't decide *whether* an assessment is needed, only carries out a decision already
 * made. Resolves the contact/address FSM needs from what CRM already has on file (the
 * opportunity's own primary contact, the party's own primary `service` address) rather
 * than asking the founder to re-enter them; "Missing address/contact requirements
 * clearly shown" is the caller's job (the page shows what's missing before this ever
 * runs), not this function silently failing on nulls FSM's own schema already tolerates.
 */
export async function createAssessmentRequestForOpportunity(businessId: string, opportunityId: string): Promise<{ assessmentRequestId: string }> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("id, party_id, assessment_requirement, assessment_request_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;
  if (opportunity.assessment_request_id) return { assessmentRequestId: opportunity.assessment_request_id };

  const requirement = opportunity.assessment_requirement as AssessmentRequirement | null;
  if (!requirement || requirement === "none") {
    throw new Error("Set an assessment requirement (remote, on-site, or technical) before requesting one.");
  }

  const [contacts, serviceAddress, discovery] = await Promise.all([
    listOpportunityContacts(businessId, opportunityId),
    getPrimaryAddress(opportunity.party_id, "service"),
    getProspectSummaryForParty(businessId, opportunity.party_id),
  ]);
  const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
  const discoveryContext = discovery.ok && discovery.data ? `Discovery: ${discovery.data.productName} -- ${discovery.data.status}/${discovery.data.outcome}` : null;

  const result = await createFsmAssessmentFromCrmOpportunity(businessId, {
    crmOpportunityId: opportunityId,
    partyId: opportunity.party_id,
    contactId: primaryContact?.partyContactId ?? null,
    serviceAddressId: serviceAddress?.id ?? null,
    kind: requirement,
    discoveryContext,
  });
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "FSM isn't licensed for this business." : result.error);

  const { error: updateError } = await supabase
    .from("opportunity")
    .update({ assessment_request_id: result.data.assessmentId })
    .eq("id", opportunityId)
    .eq("business_id", businessId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.assessment_requested",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    after: { assessment_request_id: result.data.assessmentId },
  });

  return { assessmentRequestId: result.data.assessmentId };
}
