import { describe, expect, it } from "vitest";
import { buildLinkedObjectGraph } from "./queries";
import type { Opportunity } from "../opportunities/types";
import type { CommercialJourneyState } from "../journey/types";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    business_id: "biz-1",
    party_id: "party-1",
    lead_id: null,
    stage_id: null,
    status: "open",
    source: "manual",
    source_module: null,
    source_reference: null,
    owner_id: null,
    estimated_value: null,
    currency: "INR",
    probability: null,
    expected_close_date: null,
    next_action_id: null,
    fsm_opportunity_id: null,
    fulfillment_requirement: null,
    fulfillment_request_id: null,
    assessment_requirement: null,
    assessment_request_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildLinkedObjectGraph", () => {
  it("returns no nodes when nothing is linked yet", () => {
    const graph = buildLinkedObjectGraph("biz-1", opportunity(), null, null, []);
    expect(graph).toEqual({ opportunityId: "opp-1", nodes: [] });
  });

  it("adds an unclickable node for a linked Discovery prospect and CRM lead", () => {
    const journey = { discovery: { prospectId: "prospect-1" }, crm: { leadId: "lead-1" } } as CommercialJourneyState;
    const graph = buildLinkedObjectGraph("biz-1", opportunity(), journey, null, []);
    expect(graph.nodes).toEqual([
      { id: "discovery:prospect:prospect-1", module: "discovery", entityType: "prospect", label: "Discovery prospect", href: null },
      { id: "crm:lead:lead-1", module: "crm", entityType: "lead", label: "CRM lead", href: null },
    ]);
  });

  it("adds one node per linked product", () => {
    const graph = buildLinkedObjectGraph("biz-1", opportunity(), null, null, [
      { id: "pi-1", itemId: "item-1", itemName: "Widget", quantity: 2, unitPrice: 100, lineValue: 200 },
    ]);
    expect(graph.nodes).toEqual([{ id: "inventory:product:pi-1", module: "inventory", entityType: "product", label: "Widget", href: null }]);
  });

  it("adds clickable nodes for an FSM opportunity, job, and assessment, and an unclickable one for a fulfillment request", () => {
    const graph = buildLinkedObjectGraph(
      "biz-1",
      opportunity({ fulfillment_request_id: "so-1", assessment_request_id: "assess-1" }),
      null,
      { fsmOpportunityId: "fsm-opp-1", jobId: "job-1" } as never,
      [],
    );
    expect(graph.nodes).toEqual([
      { id: "inventory:fulfillment_request:so-1", module: "inventory", entityType: "fulfillment_request", label: "Inventory fulfillment request", href: null },
      { id: "fsm:opportunity:fsm-opp-1", module: "fsm", entityType: "opportunity", label: "FSM opportunity", href: "/dashboard/businesses/biz-1/fsm/opportunities/fsm-opp-1" },
      { id: "fsm:job:job-1", module: "fsm", entityType: "job", label: "FSM job", href: "/dashboard/businesses/biz-1/fsm/jobs/job-1" },
      { id: "fsm:assessment:assess-1", module: "fsm", entityType: "assessment", label: "FSM assessment", href: "/dashboard/businesses/biz-1/fsm/assessments/assess-1" },
    ]);
  });

  it("omits an FSM job node when a quote exists but no job has been created yet", () => {
    const graph = buildLinkedObjectGraph("biz-1", opportunity(), null, { fsmOpportunityId: "fsm-opp-1", jobId: null } as never, []);
    expect(graph.nodes).toEqual([
      { id: "fsm:opportunity:fsm-opp-1", module: "fsm", entityType: "opportunity", label: "FSM opportunity", href: "/dashboard/businesses/biz-1/fsm/opportunities/fsm-opp-1" },
    ]);
  });
});
