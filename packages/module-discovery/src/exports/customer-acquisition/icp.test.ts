// EXP-DISC-06 -- ICP export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderExport } from "@cofounderai/core/exports/render";
import type { IcpProfile, IcpProfileVersion } from "../../lib/icp/types";
import { FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  listIcpProfileVersions: vi.fn(),
  listBuyerPersonas: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/icp/queries", () => ({ getIcpProfile: h.getIcpProfile, listIcpProfileVersions: h.listIcpProfileVersions }));
vi.mock("../../lib/personas/queries", () => ({ listBuyerPersonas: h.listBuyerPersonas }));

const { discoveryIcpExport: adapter, changedFieldsSummary } = await import("./icp");

const content = {
  name: "Mid-market logistics",
  description: null,
  industries: ["Logistics", "Retail"],
  company_sizes: ["51-200"],
  geographies: ["India"],
  roles: ["Head of Ops"],
  pain_points: ["Stock visibility"],
  buying_signals: [],
  exclusions: [],
  revenue: [],
  business_model: [],
  technology: [],
  growth_stage: [],
  existing_tools: [],
  confidence: 0.85,
  evidence: ["Profile names warehouse operators", "Pricing page targets 3PLs"],
  status: "approved" as const,
};

const icp: IcpProfile = { id: "icp-1", workspace_id: WORKSPACE_ID, ...content, version: 2, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-05T00:00:00Z" };
const v1: IcpProfileVersion = { id: "v1", workspace_id: WORKSPACE_ID, icp_id: "icp-1", version: 1, source: "ai_generated", ...content, industries: ["Logistics"], status: "draft", created_at: "2026-09-01T00:00:00Z" };
const v2: IcpProfileVersion = { id: "v2", workspace_id: WORKSPACE_ID, icp_id: "icp-1", version: 2, source: "user_edit", ...content, created_at: "2026-09-05T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getIcpProfile.mockResolvedValue(icp);
  h.listIcpProfileVersions.mockResolvedValue([v2, v1]);
  h.listBuyerPersonas.mockResolvedValue([
    { id: "per1", workspace_id: WORKSPACE_ID, title: "CISO", role_in_committee: "executive_buyer", priority: "high", notes: null, sort_order: 0, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
  ]);
});

describe("discovery.icp (EXP-DISC-06)", () => {
  it("is the Discovery-licensed ICP export", () => {
    expect(adapter.id).toBe("discovery.icp");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads the ICP and personas of the verified workspace only", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.getIcpProfile).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.listBuyerPersonas).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.listIcpProfileVersions).toHaveBeenCalledWith("icp-1");
    expect(JSON.stringify(h.getIcpProfile.mock.calls)).not.toContain(FOREIGN_WORKSPACE_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
    expect(h.getIcpProfile).not.toHaveBeenCalled();
  });

  it("writes the profile, personas, evidence rows and version history", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(sheetNames(workbook)).toEqual(["ICP Profile", "Personas", "Evidence", "Version History"]);
    expect(headersOf(workbook, "Version History")).toEqual(["Version", "Created", "Source", "Status", "Changed fields", "Confidence"]);

    expect(rowsOf(workbook, "ICP Profile")[0]).toMatchObject({
      Name: "Mid-market logistics",
      Industries: ["Logistics", "Retail"],
      Description: null,
      Status: "Approved",
      Version: 2,
      "Current version source": "Manual edit",
      Confidence: 0.85,
      "Confidence basis": "AI-derived",
    });
    expect(rowsOf(workbook, "Personas")[0]).toMatchObject({ Persona: "CISO", "Role in buying committee": "Executive buyer", Priority: "High" });
    // Evidence is one readable row per item, never a JSON blob.
    expect(rowsOf(workbook, "Evidence")).toEqual([
      { "#": 1, Evidence: "Profile names warehouse operators", Basis: "AI-derived" },
      { "#": 2, Evidence: "Pricing page targets 3PLs", Basis: "AI-derived" },
    ]);
    expect(rowsOf(workbook, "Version History")).toEqual([
      expect.objectContaining({ Version: 2, Source: "Manual edit", "Changed fields": "Industries, Status" }),
      expect.objectContaining({ Version: 1, Source: "AI generated", "Changed fields": "Initial version", Status: "Draft" }),
    ]);
  });

  it("still exports personas for an offering with no ICP yet", async () => {
    h.getIcpProfile.mockResolvedValue(null);
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.listIcpProfileVersions).not.toHaveBeenCalled();
    expect(rowsOf(workbook, "ICP Profile")).toEqual([]);
    expect(rowsOf(workbook, "Personas")).toHaveLength(1);
  });

  it("renders: list fields joined readably in CSV, every sheet in Excel", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    const options = { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T00:00:00Z") };
    const csv = new TextDecoder().decode((await renderExport(workbook, "csv", options)).body);
    expect(csv).toContain("Logistics; Retail");
    expect(csv).toContain("0.85");
    const xlsx = await renderExport(workbook, "xlsx", options);
    expect(xlsx.filename).toBe("wonderark_discovery_icp_2026-09-26.xlsx");
    expect(xlsx.body.byteLength).toBeGreaterThan(0);
  });

  it("summarises an unchanged save as such", () => {
    expect(changedFieldsSummary({ ...v2, version: 3 }, v2)).toBe("No content changes");
  });
});
