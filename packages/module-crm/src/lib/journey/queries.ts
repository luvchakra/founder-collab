import { hasModule } from "@cofounderai/core/licensing/queries";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { getLead } from "../leads/queries";
import { getOpportunity, listStages, getFsmQuoteStatusForOpportunity, getFulfillmentStatusForOpportunity } from "../opportunities/queries";
import { deriveFulfillmentCommitmentState } from "../opportunities/fulfillment";
import { listOpportunityProducts } from "../opportunities/products";
import type { CommercialJourneyState, JourneyAction, JourneyModuleSection, NextActionResolution } from "./types";

/**
 * INT-01.1's "Commercial Journey Resolver" -- read-only, reads exclusively through each
 * module's own public contract (or CRM's own already-existing query functions for the
 * CRM-owned half), never touches another module's tables directly, and never mutates
 * anything. Missing/unlicensed modules resolve to an explicit `not_available` section
 * rather than being silently omitted or crashing the whole resolver (INT-01.1's own
 * acceptance criterion).
 *
 * Discovery and FSM sections reuse the exact contract calls `timeline/queries.ts`'s
 * `listRelationshipTimeline()` already makes for the same party/opportunity
 * (`getProspectSummaryForParty`, `getFsmQuoteStatusForOpportunity`) -- one read model,
 * two presentations (a chronological feed there, a compact per-module rollup here).
 *
 * The Inventory section reports product-count linkage until a fulfillment request
 * exists (INT-02.2), then the live commitment state INT-02.3's
 * `deriveFulfillmentCommitmentState()` projects from it -- never a cached copy.
 */
export async function resolveCommercialJourney(businessId: string, opportunityId: string): Promise<CommercialJourneyState | null> {
  const opportunity = await getOpportunity(businessId, opportunityId);
  if (!opportunity) return null;

  const [lead, stages, discoveryLicensed, inventoryLicensed, fsmLicensed] = await Promise.all([
    opportunity.lead_id ? getLead(businessId, opportunity.lead_id) : Promise.resolve(null),
    listStages(businessId),
    hasModule(businessId, "discovery"),
    hasModule(businessId, "inventory"),
    hasModule(businessId, "fsm"),
  ]);

  // --- Discovery -----------------------------------------------------------
  let discovery: CommercialJourneyState["discovery"];
  if (!discoveryLicensed) {
    discovery = { status: "not_available", label: "Discovery not licensed", prospectId: null };
  } else {
    const result = await getProspectSummaryForParty(businessId, opportunity.party_id);
    if (!result.ok || !result.data) {
      discovery = { status: "not_applicable", label: "No discovery record", prospectId: null };
    } else {
      discovery = {
        status: "ok",
        label: `${result.data.status}/${result.data.outcome}`,
        prospectId: result.data.prospectId,
      };
    }
  }

  // --- CRM -------------------------------------------------------------------
  const stage = stages.find((s) => s.id === opportunity.stage_id);
  const crm: CommercialJourneyState["crm"] =
    opportunity.status === "lost"
      ? { status: "blocked", label: "Lost", leadId: opportunity.lead_id, opportunityStatus: opportunity.status, ownerId: opportunity.owner_id, nextActionId: opportunity.next_action_id }
      : opportunity.status === "won"
        ? { status: "ok", label: "Won", leadId: opportunity.lead_id, opportunityStatus: opportunity.status, ownerId: opportunity.owner_id, nextActionId: opportunity.next_action_id }
        : {
            status: "ok",
            label: stage?.name ?? "Open",
            leadId: opportunity.lead_id,
            opportunityStatus: opportunity.status,
            ownerId: opportunity.owner_id,
            nextActionId: opportunity.next_action_id,
          };

  // --- Inventory ---------------------------------------------------------------
  // INT-02.3: once a fulfillment request exists, its status is always re-read live
  // through the Inventory contract (never cached here) and projected through
  // `deriveFulfillmentCommitmentState()` -- the same "one pointer, everything else read
  // live" discipline `fsm_opportunity_id`/`getFsmQuoteStatusForOpportunity()` already
  // established just below. A cancelled/returned commitment surfaces as `warning` (same
  // treatment as FSM's own stale-reference case) rather than `ok`, so a won opportunity
  // whose fulfillment fell through doesn't silently read as fully handled.
  let inventory: CommercialJourneyState["inventory"];
  if (!inventoryLicensed) {
    inventory = { status: "not_available", label: "Inventory not licensed", productCount: 0, fulfillmentRequestId: null, commitmentState: null };
  } else {
    const products = await listOpportunityProducts(businessId, opportunityId);
    if (products.length === 0) {
      inventory = { status: "not_applicable", label: "No products linked", productCount: 0, fulfillmentRequestId: null, commitmentState: null };
    } else if (!opportunity.fulfillment_request_id) {
      inventory = {
        status: "ok",
        label: `${products.length} product${products.length === 1 ? "" : "s"} linked`,
        productCount: products.length,
        fulfillmentRequestId: null,
        commitmentState: null,
      };
    } else {
      const fulfillmentStatus = await getFulfillmentStatusForOpportunity(businessId, opportunity);
      if (!fulfillmentStatus) {
        inventory = {
          status: "warning",
          label: "Fulfillment reference is stale",
          productCount: products.length,
          fulfillmentRequestId: opportunity.fulfillment_request_id,
          commitmentState: null,
        };
      } else {
        const commitment = deriveFulfillmentCommitmentState(fulfillmentStatus.status);
        inventory = {
          status: commitment.state === "cancelled" ? "warning" : "ok",
          label: `Fulfillment: ${commitment.label}`,
          productCount: products.length,
          fulfillmentRequestId: opportunity.fulfillment_request_id,
          commitmentState: commitment.state,
        };
      }
    }
  }

  // --- FSM ---------------------------------------------------------------------
  let fsm: CommercialJourneyState["fsm"];
  if (!fsmLicensed) {
    fsm = { status: "not_available", label: "FSM not licensed", fsmOpportunityId: null, jobStatus: null };
  } else if (!opportunity.fsm_opportunity_id) {
    fsm = { status: "not_applicable", label: "No FSM engagement yet", fsmOpportunityId: null, jobStatus: null };
  } else {
    const quoteStatus = await getFsmQuoteStatusForOpportunity(businessId, opportunity);
    if (!quoteStatus) {
      fsm = { status: "warning", label: "FSM quote reference is stale", fsmOpportunityId: opportunity.fsm_opportunity_id, jobStatus: null };
    } else if (quoteStatus.jobStatus) {
      fsm = { status: "ok", label: `Job ${quoteStatus.jobStatus}`, fsmOpportunityId: opportunity.fsm_opportunity_id, jobStatus: quoteStatus.jobStatus };
    } else {
      const quoteLabel = quoteStatus.estimateStatus ?? quoteStatus.opportunityStatus;
      fsm = {
        status: quoteLabel === "accepted" ? "warning" : "ok",
        label: `Quote ${quoteLabel}${quoteLabel === "accepted" ? " -- job not created yet" : ""}`,
        fsmOpportunityId: opportunity.fsm_opportunity_id,
        jobStatus: null,
      };
    }
  }

  const { overallStage, blockedReason, nextRecommendedAction } = deriveOverallState(crm, inventory, fsm);

  return { opportunityId, discovery, crm, inventory, fsm, overallStage, blockedReason, nextRecommendedAction };
}

export function deriveOverallState(
  crm: JourneyModuleSection,
  inventory: CommercialJourneyState["inventory"],
  fsm: JourneyModuleSection,
): Pick<CommercialJourneyState, "overallStage" | "blockedReason" | "nextRecommendedAction"> {
  if (crm.status === "blocked") {
    return { overallStage: "closed_lost", blockedReason: "Opportunity marked lost", nextRecommendedAction: null };
  }

  // INT-02.4: "fulfilled" is the only commitment state that counts as done -- a merely
  // requested/reserved one is still in progress, distinct from `status: "ok"` alone
  // (which both share until the commitment actually reaches its terminal state).
  const fulfillmentPending = inventory.status === "warning" || (inventory.status === "ok" && inventory.productCount > 0 && inventory.commitmentState !== "fulfilled");
  const fsmPending = fsm.status === "warning";

  if (crm.label === "Won") {
    if (fulfillmentPending || fsmPending) {
      return {
        overallStage: "won_in_progress",
        blockedReason: null,
        nextRecommendedAction: fsmPending ? "Create the FSM job for the accepted quote." : "Fulfill the linked products.",
      };
    }
    return { overallStage: "won_complete", blockedReason: null, nextRecommendedAction: null };
  }

  if (fsm.status === "warning") {
    return { overallStage: "in_progress", blockedReason: null, nextRecommendedAction: "Create the FSM job for the accepted quote." };
  }

  return { overallStage: "in_progress", blockedReason: null, nextRecommendedAction: null };
}

/**
 * INT-01.2's "Next Cross-Module Action Resolver" -- a pure function over the state
 * INT-01.1's resolver already computed (no second round of contract calls; the journey
 * state already carries everything this needs). Deterministic prerequisites decide
 * `enabled`/`disabledReason` first; nothing here is AI-driven or can bypass a missing
 * prerequisite (the epic's own rule: "AI may explain/recommend but cannot bypass
 * required validation" -- there is no AI in this function at all, deliberately, per
 * CLAUDE.md principle 4, "do not use an LLM for deterministic operations").
 */
export function resolveNextCrossModuleAction(state: CommercialJourneyState): NextActionResolution {
  const actions: JourneyAction[] = [];

  // A quote was accepted but no job exists yet -- always the most urgent cross-module
  // action once it applies (nothing else matters more once a customer has said yes).
  if (state.fsm.status === "warning" && state.fsm.fsmOpportunityId) {
    actions.push({ code: "create_fsm_job", label: "Create FSM job", enabled: true, disabledReason: null });
  }

  // Won, with products linked and no fulfillment request made yet -- already requested
  // (`fulfillmentRequestId` set) means there's nothing left for this resolver to
  // recommend here; re-requesting after a cancellation is INT-05's "partial
  // fulfillment/shortage loop" territory, not this one.
  if (state.crm.opportunityStatus === "won" && state.inventory.status === "ok" && state.inventory.productCount > 0 && !state.inventory.fulfillmentRequestId) {
    actions.push({ code: "request_fulfillment", label: "Request inventory fulfillment", enabled: true, disabledReason: null });
  }

  // Open opportunity, FSM licensed, no quote created yet, but products are already
  // linked -- the same prerequisite the page's own "Create FSM quote" button already
  // enforces (at least one product). Points at that same existing action rather than a
  // new one this resolver would have to duplicate.
  if (state.crm.opportunityStatus === "open" && state.fsm.status === "not_applicable" && state.inventory.status === "ok" && state.inventory.productCount > 0) {
    actions.push({ code: "create_fsm_quote", label: "Create FSM quote", enabled: true, disabledReason: null });
  }

  // Won, nothing else pending in either module -- the relationship itself is the only
  // thing left to act on. INT-02.4: a fulfillment request that's merely reserved isn't
  // "nothing else pending" -- only `commitmentState === "fulfilled"` (or no Inventory
  // engagement at all) counts, matching `deriveOverallState()`'s own `fulfillmentPending`
  // rule ("Inventory fulfilled -> CRM post-sale journey" when FSM isn't required).
  if (
    state.crm.opportunityStatus === "won" &&
    (state.inventory.status === "not_applicable" || state.inventory.status === "not_available" || state.inventory.commitmentState === "fulfilled") &&
    (state.fsm.status === "not_applicable" || state.fsm.status === "not_available")
  ) {
    actions.push({ code: "follow_up_customer", label: "Follow up with customer", enabled: true, disabledReason: null });
  }

  const [primary = null, ...alternatives] = actions;
  return { primary, alternatives };
}

/** Convenience wrapper for callers (the opportunity detail page) that don't already
 * have a `CommercialJourneyState` in hand. */
export async function resolveNextCrossModuleActionForOpportunity(businessId: string, opportunityId: string): Promise<NextActionResolution | null> {
  const state = await resolveCommercialJourney(businessId, opportunityId);
  if (!state) return null;
  return resolveNextCrossModuleAction(state);
}
