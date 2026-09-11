import { hasModule } from "@cofounderai/core/licensing/queries";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { getLead } from "../leads/queries";
import { getOpportunity, listStages, getFsmQuoteStatusForOpportunity } from "../opportunities/queries";
import { listOpportunityProducts } from "../opportunities/products";
import type { CommercialJourneyState, JourneyModuleSection } from "./types";

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
 * The Inventory section is deliberately minimal today: no "fulfillment request" entity
 * exists yet (that's INT-02's own job), so this can only report whether products are
 * linked at all, not a real reservation/commitment state. INT-02.3/02.4 extends this
 * exact function once that entity exists, rather than this story inventing one early.
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
  let inventory: CommercialJourneyState["inventory"];
  if (!inventoryLicensed) {
    inventory = { status: "not_available", label: "Inventory not licensed", productCount: 0 };
  } else {
    const products = await listOpportunityProducts(businessId, opportunityId);
    inventory =
      products.length === 0
        ? { status: "not_applicable", label: "No products linked", productCount: 0 }
        : { status: "ok", label: `${products.length} product${products.length === 1 ? "" : "s"} linked`, productCount: products.length };
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
  inventory: JourneyModuleSection & { productCount: number },
  fsm: JourneyModuleSection,
): Pick<CommercialJourneyState, "overallStage" | "blockedReason" | "nextRecommendedAction"> {
  if (crm.status === "blocked") {
    return { overallStage: "closed_lost", blockedReason: "Opportunity marked lost", nextRecommendedAction: null };
  }

  const fulfillmentPending = inventory.status === "ok" && inventory.productCount > 0;
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
