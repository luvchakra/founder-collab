// EXP-DISC-03 -- Offering Prospects export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderExport } from "@cofounderai/core/exports/render";
import { ExportDeniedError } from "@cofounderai/core/exports/server";
import type { ProspectExportRow } from "./queries";
import {
  OTHER_BUSINESS_ID,
  PRODUCT_ID,
  WORKSPACE_ID,
  headersOf,
  makeContext,
  makeProduct,
  makeWorkspace,
  rowsOf,
  serialized,
  tamperedParams,
} from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProspectsForExport: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("./queries", () => ({ listProspectsForExport: h.listProspectsForExport }));

const { discoveryProspectsExport: adapter } = await import("./prospects");

function prospect(overrides: Partial<ProspectExportRow> = {}): ProspectExportRow {
  return {
    id: "p1",
    workspace_id: WORKSPACE_ID,
    company_name: "Globex",
    website: "https://globex.example",
    domain: "globex.example",
    industry: "Logistics",
    company_size: "51-200",
    location: "Pune",
    description: null,
    status: "qualified",
    outcome: "open",
    fit_score: 82,
    linkedin_url: null,
    twitter_url: null,
    company_email: "hello@globex.example",
    party_id: null,
    created_at: "2026-09-10T04:30:00Z",
    updated_at: "2026-09-11T04:30:00Z",
    stage: "scored",
    nextAction: "Generate strategy",
    lastActivityAt: "2026-09-12T04:30:00Z",
    isStuck: false,
    researchedAt: "2026-09-11T04:30:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.listProspectsForExport.mockResolvedValue([
    prospect(),
    prospect({ id: "p2", company_name: "Initech", fit_score: null, status: "new", stage: "new", nextAction: "Research", researchedAt: null, industry: null }),
  ]);
});

describe("discovery.prospects (EXP-DISC-03)", () => {
  it("is the Discovery-licensed prospects export with the page's (empty) permission set", () => {
    expect(adapter.id).toBe("discovery.prospects");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("queries the workspace of an offering verified against context.businessId, never ids from the request", async () => {
    const filters = adapter.parseFilters!(tamperedParams());
    await adapter.load(makeContext(), filters);
    expect(h.getProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(h.listProspectsForExport).toHaveBeenCalledWith([WORKSPACE_ID], expect.anything(), "recent");
    expect(JSON.stringify(filters)).not.toContain(OTHER_BUSINESS_ID);
  });

  it("refuses an offering that belongs to another business, before any prospect is read", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    const load = adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    await expect(load).rejects.toBeInstanceOf(ExportDeniedError);
    await expect(load).rejects.toMatchObject({ status: 404 });
    expect(h.listProspectsForExport).not.toHaveBeenCalled();
  });

  it("refuses a malformed or missing offering id without querying", async () => {
    await expect(adapter.load(makeContext(), adapter.parseFilters!(new URLSearchParams()))).rejects.toMatchObject({ status: 404 });
    await expect(adapter.load(makeContext(), adapter.parseFilters!(new URLSearchParams({ productId: "x' or 1=1" })))).rejects.toMatchObject({ status: 404 });
    expect(h.getProduct).not.toHaveBeenCalled();
  });

  it("passes the page's filters and sort to the query, and ignores unknown params", async () => {
    const filters = adapter.parseFilters!(
      tamperedParams({ status: "qualified", industry: "Logistics", stage: "scored", sort: "priority", bulkAction: "research", imported: "4" }),
    );
    expect(Object.keys(filters).sort()).toEqual(["industry", "productId", "search", "sort", "stage", "status"]);
    await adapter.load(makeContext(), filters);
    expect(h.listProspectsForExport).toHaveBeenCalledWith(
      [WORKSPACE_ID],
      { status: "qualified", industry: "Logistics", stage: "scored" },
      "priority",
    );
    expect(adapter.describeFilters!(filters)).toMatchObject({ Status: "Qualified", Stage: "Scored", Industry: "Logistics", Sort: "Priority" });
  });

  it("with no filters asks for everything in the workspace, most recent first", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(new URLSearchParams({ productId: PRODUCT_ID })));
    expect(h.listProspectsForExport).toHaveBeenCalledWith([WORKSPACE_ID], { status: undefined, industry: undefined, stage: undefined }, "recent");
  });

  it("applies the page's company-name search the way the page does", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams({ search: "  INIT " })));
    expect(rowsOf(workbook, "Prospects").map((r) => r.Company)).toEqual(["Initech"]);
  });

  it("writes labels, not codes, and keeps blanks blank", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(headersOf(workbook, "Prospects")).toEqual([
      "Company",
      "Website",
      "Domain",
      "Industry",
      "Company size",
      "Location",
      "Status",
      "Stage",
      "Next action",
      "Needs next step",
      "Fit score",
      "Fit score basis",
      "Outcome",
      "Created",
      "Last researched",
      "Last activity",
    ]);
    const [globex, initech] = rowsOf(workbook, "Prospects");
    expect(globex).toMatchObject({ Company: "Globex", Status: "Qualified", Stage: "Scored", Outcome: "Open", "Fit score": 82 });
    expect(globex!["Fit score basis"]).toMatch(/Calculated/);
    expect(initech).toMatchObject({ "Fit score": null, "Fit score basis": null, "Last researched": null, Industry: null });
    expect(workbook.metadata).toEqual({ Offering: "Sensor Suite" });
  });

  it("an empty result still produces a valid file with headers only", async () => {
    h.listProspectsForExport.mockResolvedValue([]);
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams({ status: "disqualified" })));
    const file = await renderExport(workbook, "csv", { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T00:00:00Z") });
    const text = new TextDecoder().decode(file.body);
    expect(file.rowCount).toBe(0);
    expect(file.filename).toBe("wonderark_discovery_prospects_2026-09-26.csv");
    expect(text.trim().split("\r\n")).toHaveLength(1);
  });

  it("never exports internal ids or the party link", async () => {
    h.listProspectsForExport.mockResolvedValue([prospect({ party_id: "party-secret-id", id: "prospect-internal-id" })]);
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    const text = serialized(workbook);
    expect(text).not.toContain("party-secret-id");
    expect(text).not.toContain("prospect-internal-id");
    expect(text).not.toContain(WORKSPACE_ID);
  });
});
