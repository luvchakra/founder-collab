// EXP-DISC-05 / EXP-DISC-09 -- Opportunity and Opportunity / Pipeline export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Opportunity } from "../../lib/opportunities/types";
import {
  BUSINESS_ID,
  FOREIGN_WORKSPACE_ID,
  OTHER_BUSINESS_ID,
  WORKSPACE_ID,
  headersOf,
  makeContext,
  makeProduct,
  makeWorkspace,
  rowsOf,
  tamperedParams,
} from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getOpportunityDashboardRows: vi.fn(),
  getDiscoveryHandoffLead: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/opportunities/dashboard-queries", () => ({ getOpportunityDashboardRows: h.getOpportunityDashboardRows }));
vi.mock("@cofounderai/module-crm/contract/index", () => ({ getDiscoveryHandoffLead: h.getDiscoveryHandoffLead }));

const { discoveryOpportunitiesExport: adapter } = await import("./opportunities");

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "o1",
    workspace_id: WORKSPACE_ID,
    prospect_id: "p1",
    discovery_definition_id: null,
    score: 81,
    priority: "high",
    why_them: "Runs 12 warehouses",
    why_now: "New funding",
    recommended_action: "draft_message",
    recommended_action_reason: "Strong signal and a reachable buyer",
    confidence: "high",
    status: "new",
    evidence_count: 4,
    created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
    last_evaluated_at: "2026-09-20T00:00:00Z",
    icp_fit_score: 90,
    buyer_fit_score: null,
    need_fit_score: 70,
    timing_score: 60,
    signal_strength_score: 80,
    contactability_score: 50,
    evidence_confidence_score: 75,
    score_reason: "High ICP fit",
    signal_correlation_id: null,
    timing_strength: null,
    why_now_confidence: "medium",
    handoff_failed_at: null,
    handoff_error: "internal stack trace",
    recommended_action_override: null,
    ...overrides,
  };
}

const prospect = (id: string, name: string) => ({ id, company_name: name, workspace_id: WORKSPACE_ID });

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getOpportunityDashboardRows.mockResolvedValue([
    { opportunity: opportunity({ id: "o2", prospect_id: "p2", score: null, priority: "low", recommended_action: null, recommended_action_reason: null }), prospect: prospect("p2", "Initech"), bin: "insufficient_evidence", contactName: null, topSignal: null },
    { opportunity: opportunity(), prospect: prospect("p1", "Globex"), bin: "hot", contactName: "Asha Rao", topSignal: "Funding + hiring" },
    { opportunity: opportunity({ id: "o3", prospect_id: "p1", recommended_action_override: "watch", status: "reviewing", handoff_failed_at: "2026-09-21T00:00:00Z" }), prospect: prospect("p1", "Globex"), bin: "needs_review", contactName: "Asha Rao", topSignal: null },
  ]);
  h.getDiscoveryHandoffLead.mockImplementation(async (_b: string, prospectId: string) => ({ ok: true, data: prospectId === "p2" ? { id: "lead" } : null }));
});

describe("discovery.opportunities (EXP-DISC-05, EXP-DISC-09)", () => {
  it("is the Discovery-licensed opportunities export", () => {
    expect(adapter.id).toBe("discovery.opportunities");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
    expect(adapter.parseFilters!(tamperedParams({ bin: "hot" }))).toEqual({ productId: expect.any(String) });
  });

  it("reads the verified workspace and asks CRM for this business only, once per prospect", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.getOpportunityDashboardRows).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.getOpportunityDashboardRows).not.toHaveBeenCalledWith(FOREIGN_WORKSPACE_ID);
    expect(h.getDiscoveryHandoffLead.mock.calls).toEqual([
      [BUSINESS_ID, "p1"],
      [BUSINESS_ID, "p2"],
    ]);
    expect(JSON.stringify(h.getDiscoveryHandoffLead.mock.calls)).not.toContain(OTHER_BUSINESS_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
    expect(h.getOpportunityDashboardRows).not.toHaveBeenCalled();
  });

  it("orders rows by the page's bins and labels stage, status, action and handoff", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    const headers = headersOf(workbook, "Opportunities");
    expect(headers.slice(0, 6)).toEqual(["Stage", "Prospect", "Contact", "Status", "Priority", "Opportunity score"]);
    expect(headers).toEqual(expect.arrayContaining(["Recommended action", "Recommendation source", "CRM handoff", "CRM handoff source", "Age (days)", "ICP fit", "Evidence confidence"]));

    const rows = rowsOf(workbook, "Opportunities");
    expect(rows.map((r) => r.Stage)).toEqual(["Hot", "Needs Review", "Insufficient Evidence"]);
    expect(rows[0]).toMatchObject({
      Prospect: "Globex",
      Status: "New",
      Priority: "High",
      "Opportunity score": 81,
      "Score basis": "Calculated",
      "Recommended action": "Draft Message",
      "Recommendation source": "System recommendation",
      "Recommendation reason": "Strong signal and a reachable buyer",
      "CRM handoff": "Not Sent",
      "Buyer fit": null,
    });
    expect(rows[0]!["Age (days)"]).toEqual(expect.any(Number));
    expect(rows[1]).toMatchObject({ Status: "Reviewing", "Recommended action": "Watch", "Recommendation source": "Founder override", "Recommendation reason": null, "CRM handoff": "Handoff Failed" });
    expect(rows[2]).toMatchObject({ "Opportunity score": null, "Score basis": null, "Recommended action": null, "Recommendation source": null, "CRM handoff": "Already in CRM" });
  });

  it("leaves 'Not Sent' blank and says why when CRM isn't licensed", async () => {
    h.getDiscoveryHandoffLead.mockResolvedValue({ ok: false, error: "MODULE_NOT_LICENSED" });
    const rows = rowsOf(await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams())), "Opportunities");
    expect(rows[0]).toMatchObject({ "CRM handoff": null, "CRM handoff source": expect.stringContaining("CRM not licensed") });
    // A failure Discovery itself recorded is still known without CRM.
    expect(rows[1]).toMatchObject({ "CRM handoff": "Handoff Failed" });
  });

  it("never exports the raw handoff error", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(JSON.stringify(rowsOf(workbook, "Opportunities"))).not.toContain("internal stack trace");
  });
});
