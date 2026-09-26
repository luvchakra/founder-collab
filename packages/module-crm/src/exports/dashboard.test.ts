import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-01 -- CRM Dashboard export (KPIs, Pipeline, Lost Business, Response, Exceptions).

const mocks = vi.hoisted(() => ({
  getPotentialLostBusinessDashboard: vi.fn(),
  getCrmDashboardKpis: vi.fn(),
  getResponsePerformance: vi.fn(),
  listCrossModuleExceptions: vi.fn(),
  listStages: vi.fn(),
  listEmployeeOptions: vi.fn(),
  listOpportunitiesForExport: vi.fn(),
  listPotentialLostBusinessQueueForExport: vi.fn(),
}));
vi.mock("../lib/dashboard/queries", () => ({
  getPotentialLostBusinessDashboard: mocks.getPotentialLostBusinessDashboard,
  getCrmDashboardKpis: mocks.getCrmDashboardKpis,
}));
vi.mock("../lib/dashboard/response-performance", () => ({ getResponsePerformance: mocks.getResponsePerformance }));
vi.mock("../lib/exceptions/queries", () => ({ listCrossModuleExceptions: mocks.listCrossModuleExceptions }));
vi.mock("../lib/opportunities/queries", () => ({ listStages: mocks.listStages }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));
vi.mock("./queries", () => ({
  listOpportunitiesForExport: mocks.listOpportunitiesForExport,
  listPotentialLostBusinessQueueForExport: mocks.listPotentialLostBusinessQueueForExport,
}));

import { crmDashboardExport } from "./dashboard";
import { BUSINESS_ID, exportContext, requestParams, rowsOf, serialized } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPotentialLostBusinessDashboard.mockResolvedValue({
    unansweredMessages: 4,
    unansweredSocialQuestions: 0,
    unansweredReviewsRequiringAction: 2,
    overdueLeads: 1,
    staleOpportunities: 3,
    openHighIntentConversations: 1,
  });
  mocks.getCrmDashboardKpis.mockResolvedValue({
    newLeads: 5,
    openOpportunities: 2,
    pipelineValue: 150000,
    wonValue: 0,
    openConversations: 7,
    unansweredCommercialInteractions: 4,
    overdueFollowUps: 1,
    quoteFollowUps: 0,
    responseSlaPercent: null,
  });
  mocks.getResponsePerformance.mockResolvedValue({
    medianFirstResponseMinutes: 42,
    slaCompliancePercent: 80,
    unresolvedByAge: [{ bucket: "0-1 day", count: 3 }],
    ownerPerformance: [],
    channelResponseTime: [],
  });
  mocks.listCrossModuleExceptions.mockResolvedValue([
    {
      id: "assessment_pending:o1",
      kind: "assessment_pending",
      module: "crm",
      label: "Ravi -- assessment pending",
      detail: "Not yet requested",
      detailHref: "/x",
      entityId: "o1",
      assessmentRequested: false,
    },
  ]);
  mocks.listStages.mockResolvedValue([]);
  mocks.listEmployeeOptions.mockResolvedValue([]);
  mocks.listOpportunitiesForExport.mockResolvedValue([]);
  mocks.listPotentialLostBusinessQueueForExport.mockResolvedValue([
    {
      interactionId: "i1",
      conversationId: "c1",
      partyId: "p1",
      channel: "whatsapp",
      contentExcerpt: "PRIVATE MESSAGE BODY",
      occurredAt: "2026-09-25T04:00:00Z",
      intent: "pricing",
      opportunityId: null,
      responseDueAt: null,
      ageMs: 3_600_000,
      overdue: false,
      partyName: "Asha",
      opportunityValue: null,
      opportunityCurrency: null,
      ownerId: null,
    },
  ]);
});

describe("crm.dashboard (EXP-CRM-01)", () => {
  it("is gated by the CRM dashboards-and-analytics permission", () => {
    expect(crmDashboardExport.id).toBe("crm.dashboard");
    expect(crmDashboardExport.module).toBe("crm");
    expect(crmDashboardExport.permissions).toEqual(["analytics.view"]);
  });

  it("reads every dataset for the resolved business only (tenant isolation)", async () => {
    const filters = crmDashboardExport.parseFilters!(requestParams());
    expect(filters).toEqual({});
    await crmDashboardExport.load(exportContext(), filters);
    for (const fn of Object.values(mocks)) expect(fn).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("has the backlog's five sheets", async () => {
    const workbook = await crmDashboardExport.load(exportContext(), {});
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["KPIs", "Pipeline", "Lost Business", "Response", "Exceptions"]);
  });

  it("exports KPI numbers, typed, with an unknown SLA left blank (never zero)", async () => {
    const workbook = await crmDashboardExport.load(exportContext(), {});
    const kpis = rowsOf(workbook, "KPIs");
    expect(kpis.find((r) => r.Metric === "Unanswered messages")).toMatchObject({ Count: 4, "Amount (INR)": null });
    expect(kpis.find((r) => r.Metric === "Pipeline value")).toMatchObject({ Count: null, "Amount (INR)": 150000 });
    expect(kpis.find((r) => r.Metric === "Open exceptions")).toMatchObject({ Count: 1 });
    expect(kpis.find((r) => r.Metric === "Response SLA (last 30 days)")).toMatchObject({ Rate: null, Note: "No SLA deadline has passed yet" });
    const response = rowsOf(workbook, "Response");
    expect(response.find((r) => r.Metric === "SLA compliance")).toMatchObject({ Rate: 0.8 });
    expect(response.find((r) => r.Metric === "Median first response")).toMatchObject({ Minutes: 42 });
  });

  it("carries lost-business metadata but never raw message content", async () => {
    const workbook = await crmDashboardExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Lost Business")[0]).toMatchObject({
      Contact: "Asha",
      Channel: "WhatsApp",
      "Message intent": "Pricing",
      "High commercial intent": true,
      Owner: "Unassigned",
      SLA: "On track",
    });
    expect(serialized(workbook)).not.toContain("PRIVATE MESSAGE BODY");
    expect(rowsOf(workbook, "Exceptions")[0]).toMatchObject({ Exception: "Assessment pending", Module: "CRM", Status: "Open" });
  });
});
