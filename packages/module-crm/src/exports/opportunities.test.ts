import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-03 -- CRM opportunities export (List rows + Kanban stage totals).

const mocks = vi.hoisted(() => ({
  listOpportunitiesForExport: vi.fn(),
  listPartiesForExport: vi.fn(),
  listStages: vi.fn(),
  listEmployeeOptions: vi.fn(),
  ensureDefaultStages: vi.fn(),
}));
vi.mock("./queries", () => ({ listOpportunitiesForExport: mocks.listOpportunitiesForExport, listPartiesForExport: mocks.listPartiesForExport }));
vi.mock("../lib/opportunities/queries", () => ({ listStages: mocks.listStages }));
vi.mock("../lib/opportunities/mutations", () => ({ ensureDefaultStages: mocks.ensureDefaultStages }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));

import { crmOpportunitiesExport } from "./opportunities";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

function opp(overrides: Record<string, unknown>) {
  return {
    id: "opp",
    business_id: BUSINESS_ID,
    party_id: "party-1",
    lead_id: null,
    stage_id: "stage-new",
    status: "open",
    source: "referral",
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
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

const STAGES = [
  { id: "stage-new", business_id: BUSINESS_ID, key: "new", name: "New", sort_order: 0, is_won: false, is_lost: false },
  { id: "stage-won", business_id: BUSINESS_ID, key: "won", name: "Won", sort_order: 5, is_won: true, is_lost: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStages.mockResolvedValue(STAGES);
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-1", full_name: "Kunal", email: null }]);
  mocks.listPartiesForExport.mockResolvedValue(new Map([["party-1", { id: "party-1", name: "Ravi", kind: "person", email: null, phone: null }]]));
  mocks.listOpportunitiesForExport.mockResolvedValue([
    opp({
      id: "o1",
      estimated_value: 125000,
      probability: 25,
      expected_close_date: "2026-10-31",
      owner_id: "emp-1",
      fulfillment_requirement: "service_only",
    }),
    opp({ id: "o2" }),
    opp({ id: "o3", stage_id: "stage-won", status: "won", estimated_value: 50000 }),
  ]);
});

describe("crm.opportunities (EXP-CRM-03)", () => {
  it("is licensed and permissioned like the Opportunities page", () => {
    expect(crmOpportunitiesExport.id).toBe("crm.opportunities");
    expect(crmOpportunitiesExport.module).toBe("crm");
    expect(crmOpportunitiesExport.permissions).toEqual(["crm.view"]);
  });

  it("reads the resolved business only and never provisions stages (tenant isolation, read-only)", async () => {
    const filters = crmOpportunitiesExport.parseFilters!(requestParams({ view: "list", stage: "won" }));
    expect(filters).toEqual({});
    await crmOpportunitiesExport.load(exportContext(), filters);
    expect(mocks.listOpportunitiesForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listStages).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.ensureDefaultStages).not.toHaveBeenCalled();
  });

  it("exports list rows with labels, typed money and blank estimates", async () => {
    const workbook = await crmOpportunitiesExport.load(exportContext(), {});
    expect(headers(workbook, "Opportunities")).toEqual([
      "Contact / customer",
      "Stage",
      "Status",
      "Estimated value",
      "Currency",
      "Probability",
      "Expected close date",
      "Owner",
      "Source",
      "Fulfillment requirement",
      "Assessment requirement",
      "Created",
    ]);
    const [first, second] = rowsOf(workbook, "Opportunities");
    expect(first).toMatchObject({
      "Contact / customer": "Ravi",
      Stage: "New",
      Status: "Open",
      "Estimated value": 125000,
      Currency: "INR",
      Probability: 0.25,
      "Expected close date": "2026-10-31",
      Owner: "Kunal",
      Source: "Referral",
      "Fulfillment requirement": "Service only",
    });
    expect(second).toMatchObject({ "Estimated value": null, Probability: null, Owner: "Unassigned", "Assessment requirement": "" });
  });

  it("adds the Kanban dataset: one row per stage, unestimated counted but not valued", async () => {
    const workbook = await crmOpportunitiesExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Pipeline by Stage")).toEqual([
      { Stage: "New", "Stage type": "Open", Opportunities: 2, "Estimated value": 125000, Currency: "INR" },
      { Stage: "Won", "Stage type": "Won", Opportunities: 1, "Estimated value": 50000, Currency: "INR" },
    ]);
  });

  it("produces headers-only sheets for an empty pipeline", async () => {
    mocks.listOpportunitiesForExport.mockResolvedValue([]);
    const workbook = await crmOpportunitiesExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Opportunities")).toEqual([]);
    expect(rowsOf(workbook, "Pipeline by Stage")).toEqual([]);
  });
});
