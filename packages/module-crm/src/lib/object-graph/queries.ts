import type { FsmQuoteStatus } from "@cofounderai/module-fsm/contract/types";
import type { CommercialJourneyState } from "../journey/types";
import type { Opportunity } from "../opportunities/types";
import type { OpportunityProduct } from "../opportunities/products";
import type { LinkedObjectGraph, ObjectGraphNode } from "./types";

/**
 * INT-08.1's Linked Object Graph resolver -- deliberately a pure function, not a query:
 * every input is already fetched by the opportunity detail page today (`journey`,
 * `fsmQuoteStatus`, `products`, plus the two bare id pointers CRM's own `opportunity`
 * row already carries), so this adds zero new DB round trips, it only restructures data
 * that exists. One hop deep off the opportunity, on purpose -- a job's own children
 * (INT-06.4's revisit jobs, INT-06.3's recommended parts) would need new cross-module
 * contract surface just to reach from here, and both are already one click away from
 * the FSM job node this function does produce, so there's no concrete need for a second
 * hop yet (CLAUDE.md principle 7).
 */
export function buildLinkedObjectGraph(
  businessId: string,
  opportunity: Opportunity,
  journey: CommercialJourneyState | null,
  fsmQuoteStatus: FsmQuoteStatus | null,
  products: OpportunityProduct[],
): LinkedObjectGraph {
  const base = `/dashboard/businesses/${businessId}`;
  const nodes: ObjectGraphNode[] = [];

  if (journey?.discovery.prospectId) {
    nodes.push({
      id: `discovery:prospect:${journey.discovery.prospectId}`,
      module: "discovery",
      entityType: "prospect",
      label: "Discovery prospect",
      href: null,
    });
  }

  if (journey?.crm.leadId) {
    nodes.push({ id: `crm:lead:${journey.crm.leadId}`, module: "crm", entityType: "lead", label: "CRM lead", href: null });
  }

  for (const product of products) {
    nodes.push({ id: `inventory:product:${product.id}`, module: "inventory", entityType: "product", label: product.itemName, href: null });
  }

  if (opportunity.fulfillment_request_id) {
    nodes.push({
      id: `inventory:fulfillment_request:${opportunity.fulfillment_request_id}`,
      module: "inventory",
      entityType: "fulfillment_request",
      label: "Inventory fulfillment request",
      href: null,
    });
  }

  if (fsmQuoteStatus?.fsmOpportunityId) {
    nodes.push({
      id: `fsm:opportunity:${fsmQuoteStatus.fsmOpportunityId}`,
      module: "fsm",
      entityType: "opportunity",
      label: "FSM opportunity",
      href: `${base}/fsm/opportunities/${fsmQuoteStatus.fsmOpportunityId}`,
    });
  }

  if (fsmQuoteStatus?.jobId) {
    nodes.push({
      id: `fsm:job:${fsmQuoteStatus.jobId}`,
      module: "fsm",
      entityType: "job",
      label: "FSM job",
      href: `${base}/fsm/jobs/${fsmQuoteStatus.jobId}`,
    });
  }

  if (opportunity.assessment_request_id) {
    nodes.push({
      id: `fsm:assessment:${opportunity.assessment_request_id}`,
      module: "fsm",
      entityType: "assessment",
      label: "FSM assessment",
      href: `${base}/fsm/assessments/${opportunity.assessment_request_id}`,
    });
  }

  return { opportunityId: opportunity.id, nodes };
}
