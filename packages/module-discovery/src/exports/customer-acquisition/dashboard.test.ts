// EXP-DISC-02 -- Discovery Dashboard export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProspectExportRow } from "./queries";
import { BUSINESS_ID, OTHER_BUSINESS_ID, PRODUCT_ID, WORKSPACE_ID, headersOf, makeBusiness, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames } from "./test-support";

const h = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  listProducts: vi.fn(),
  listWorkspacesForProducts: vi.fn(),
  getIcpProfile: vi.fn(),
  getWorkspaceUsageForWorkspaces: vi.fn(),
  getBusinessPortfolioData: vi.fn(),
  listProspectsForExport: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  listProducts: h.listProducts,
  listWorkspacesForProducts: h.listWorkspacesForProducts,
}));
vi.mock("../../lib/icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../../lib/usage/queries", () => ({ getWorkspaceUsageForWorkspaces: h.getWorkspaceUsageForWorkspaces }));
vi.mock("../../lib/portfolio/queries", () => ({ getBusinessPortfolioData: h.getBusinessPortfolioData }));
vi.mock("./queries", () => ({ listProspectsForExport: h.listProspectsForExport }));

const { discoveryDashboardExport: adapter } = await import("./dashboard");

const SECOND_PRODUCT = "77777777-7777-4777-8777-777777777777";
const SECOND_WORKSPACE = "88888888-8888-4888-8888-888888888888";

function p(stage: ProspectExportRow["stage"], overrides: Partial<ProspectExportRow> = {}) {
  return { id: `${stage}-${Math.random()}`, workspace_id: WORKSPACE_ID, stage, status: "new", outcome: "open", ...overrides } as ProspectExportRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusiness.mockResolvedValue(makeBusiness());
  h.listProducts.mockResolvedValue([makeProduct({ product_profile: {} as never }), makeProduct({ id: SECOND_PRODUCT, name: "Install Service" })]);
  h.listWorkspacesForProducts.mockResolvedValue([makeWorkspace(), makeWorkspace({ id: SECOND_WORKSPACE, product_id: SECOND_PRODUCT })]);
  h.getIcpProfile.mockImplementation(async (id: string) => (id === WORKSPACE_ID ? { id: "icp" } : null));
  h.getWorkspaceUsageForWorkspaces.mockResolvedValue({
    [WORKSPACE_ID]: {
      workspaceId: WORKSPACE_ID,
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-10-01T00:00:00.000Z",
      totalRuns: 12,
      totalCost: 4,
      byOperation: [{ operation: "research_prospect", runs: 12, cost: 4 }],
    },
    [SECOND_WORKSPACE]: {
      workspaceId: SECOND_WORKSPACE,
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-10-01T00:00:00.000Z",
      totalRuns: 0,
      totalCost: 0,
      byOperation: [],
    },
  });
  h.getBusinessPortfolioData.mockResolvedValue({
    offeringRows: [{ productId: PRODUCT_ID, productName: "Sensor Suite", workspaceId: WORKSPACE_ID, hotCount: 2, newCount: 3, conversationCount: 1 }],
    crossOfferingAccounts: [
      {
        key: "globex.example",
        companyName: "Globex",
        domain: "globex.example",
        offerings: [
          { productId: PRODUCT_ID, productName: "Sensor Suite", prospectId: "x", score: 80, priority: "high", bin: "hot" },
          { productId: SECOND_PRODUCT, productName: "Install Service", prospectId: "y", score: null, priority: null, bin: null },
        ],
      },
    ],
  });
  h.listProspectsForExport.mockResolvedValue([
    p("new"),
    p("sent", { status: "qualified" }),
    p("replied"),
    p("closed", { outcome: "won" }),
  ]);
});

describe("discovery.dashboard (EXP-DISC-02)", () => {
  it("is the Discovery-licensed dashboard export", () => {
    expect(adapter.id).toBe("discovery.dashboard");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads only the context business and its own offerings' workspaces", async () => {
    const filters = adapter.parseFilters!(new URLSearchParams({ businessId: OTHER_BUSINESS_ID, workspaceId: "ws-x" }));
    await adapter.load(makeContext(), filters);
    expect(h.getBusiness).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listProducts).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.getBusinessPortfolioData).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listProspectsForExport).toHaveBeenCalledWith([WORKSPACE_ID, SECOND_WORKSPACE]);
    expect(h.getWorkspaceUsageForWorkspaces).toHaveBeenCalledWith([WORKSPACE_ID, SECOND_WORKSPACE]);
  });

  it("exports the numbers behind each panel, one sheet each", async () => {
    const workbook = await adapter.load(makeContext(), {});
    expect(sheetNames(workbook)).toEqual(["Overview", "Offerings", "Prospect Funnel", "Cross Offering Accounts", "Usage"]);
    expect(headersOf(workbook, "Prospect Funnel")).toEqual(["Stage", "Prospects reached", "Share of all prospects", "Conversion from previous stage"]);

    const [overview] = rowsOf(workbook, "Overview");
    expect(overview).toMatchObject({
      Business: "Acme Ltd",
      Offerings: 2,
      "Offerings ready to prospect": 1,
      Prospects: 4,
      Qualified: 1,
      Won: 1,
      "Reached Sent": 3,
      "Reached Replied": 2,
      "Reply rate": 2 / 3,
      "Overall conversion": 0.25,
      "AI runs this month": 12,
      "AI credits used": 0.1,
    });

    const funnel = rowsOf(workbook, "Prospect Funnel");
    expect(funnel[0]).toMatchObject({ Stage: "New", "Prospects reached": 4, "Share of all prospects": 1 });
    expect(funnel.find((r) => r.Stage === "Sent")).toMatchObject({ "Prospects reached": 3 });

    const [sensor, install] = rowsOf(workbook, "Offerings");
    expect(sensor).toMatchObject({ Offering: "Sensor Suite", "Has ICP": true, "Ready to prospect": true, Prospects: 4, "Hot opportunities": 2 });
    expect(install).toMatchObject({ Offering: "Install Service", "Has ICP": false, Prospects: 0, "Hot opportunities": null });

    const accounts = rowsOf(workbook, "Cross Offering Accounts");
    expect(accounts[0]).toMatchObject({ Company: "Globex", Offering: "Sensor Suite", Priority: "High", "Dashboard bin": "Hot", "Opportunity score": 80 });
    expect(accounts[1]).toMatchObject({ Offering: "Install Service", Priority: null, "Dashboard bin": null, "Opportunity score": null });

    expect(rowsOf(workbook, "Usage")).toEqual([
      expect.objectContaining({ Offering: "Sensor Suite", Operation: "Prospect research", Runs: 12, "Share of monthly AI credits": 0.2 }),
    ]);
  });

  it("leaves rates blank, not zero, when there is nothing to divide by", async () => {
    h.listProspectsForExport.mockResolvedValue([]);
    const workbook = await adapter.load(makeContext(), {});
    expect(rowsOf(workbook, "Overview")[0]).toMatchObject({ Prospects: 0, "Reply rate": null, "Overall conversion": null });
    expect(rowsOf(workbook, "Prospect Funnel")[0]).toMatchObject({ "Share of all prospects": null });
  });

  it("never writes a raw AI cost figure", async () => {
    const workbook = await adapter.load(makeContext(), {});
    const headers = workbook.sheets.flatMap((s) => s.columns.map((c) => c.header.toLowerCase()));
    expect(headers.some((header) => header.includes("cost") || header.includes("usd") || header.includes("$"))).toBe(false);
  });
});
