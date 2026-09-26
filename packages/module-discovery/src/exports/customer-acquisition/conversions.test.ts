// EXP-DISC-10 -- Conversion export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProspectExportRow } from "./queries";
import { BUSINESS_ID, FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProspectsForExport: vi.fn(),
  getHandoffStatusForProspect: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("./queries", () => ({ listProspectsForExport: h.listProspectsForExport }));
vi.mock("@cofounderai/module-fsm/contract/index", () => ({ getHandoffStatusForProspect: h.getHandoffStatusForProspect }));

const { discoveryConversionsExport: adapter } = await import("./conversions");

function p(id: string, stage: ProspectExportRow["stage"], outcome: ProspectExportRow["outcome"] = "open") {
  return { id, company_name: `Co ${id}`, workspace_id: WORKSPACE_ID, stage, status: "qualified", outcome, created_at: "2026-09-01T00:00:00Z", lastActivityAt: "2026-09-20T00:00:00Z" } as ProspectExportRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.listProspectsForExport.mockResolvedValue([p("a", "new"), p("b", "sent"), p("c", "closed", "won"), p("d", "closed", "lost"), p("e", "closed", "won")]);
  h.getHandoffStatusForProspect.mockImplementation(async (_b: string, id: string) =>
    id === "c"
      ? { ok: true, data: { opportunityId: "fsm-1", opportunityStatus: "estimate_sent", jobId: null, jobStatus: "in_progress", invoiceNumber: null, invoiceStatus: null, invoiceBalanceAmount: null } }
      : { ok: false, error: "NOT_FOUND" },
  );
});

describe("discovery.conversions (EXP-DISC-10)", () => {
  it("is the Discovery-licensed conversions export", () => {
    expect(adapter.id).toBe("discovery.conversions");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads the verified workspace, and asks Service about won customers for this business only", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.listProspectsForExport).toHaveBeenCalledWith([WORKSPACE_ID]);
    expect(JSON.stringify(h.listProspectsForExport.mock.calls)).not.toContain(FOREIGN_WORKSPACE_ID);
    expect(h.getHandoffStatusForProspect.mock.calls).toEqual([
      [BUSINESS_ID, "c"],
      [BUSINESS_ID, "e"],
    ]);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
  });

  it("exposes the funnel's underlying counts and the outcome split", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(sheetNames(workbook)).toEqual(["Funnel", "Prospects", "Outcomes", "Handoffs"]);
    const funnel = rowsOf(workbook, "Funnel");
    expect(funnel.map((r) => [r.Stage, r["Prospects reached"]])).toEqual([
      ["New", 5],
      ["Researched", 4],
      ["Scored", 4],
      ["Strategized", 4],
      ["Messaged", 4],
      ["Sent", 4],
      ["Replied", 3],
      ["Closed", 3],
    ]);
    expect(funnel[6]).toMatchObject({ "Share of all prospects": 0.6, "Conversion from previous stage": 0.75 });
    expect(rowsOf(workbook, "Outcomes")).toEqual([
      { Outcome: "Open", Prospects: 2, "Share of all prospects": 0.4 },
      { Outcome: "Won", Prospects: 2, "Share of all prospects": 0.4 },
      { Outcome: "Lost", Prospects: 1, "Share of all prospects": 0.2 },
    ]);
    expect(rowsOf(workbook, "Prospects")[0]).toMatchObject({ "Furthest stage reached": "New", Status: "Qualified", Outcome: "Open" });
  });

  it("labels each won customer's Service handoff", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(headersOf(workbook, "Handoffs")).toEqual(["Customer", "Closed", "Service opportunity created", "Service opportunity status", "Job status", "Invoice", "Handoff source"]);
    expect(rowsOf(workbook, "Handoffs")).toEqual([
      expect.objectContaining({ Customer: "Co c", "Service opportunity created": true, "Service opportunity status": "Estimate sent", "Job status": "In progress" }),
      expect.objectContaining({ Customer: "Co e", "Service opportunity created": false, "Service opportunity status": null, "Handoff source": null }),
    ]);
  });

  it("leaves handoff blank and says why when Service isn't licensed", async () => {
    h.getHandoffStatusForProspect.mockResolvedValue({ ok: false, error: "MODULE_NOT_LICENSED" });
    const rows = rowsOf(await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams())), "Handoffs");
    expect(rows[0]).toMatchObject({ "Service opportunity created": null, "Handoff source": "Service not licensed" });
  });

  it("an offering with no prospects exports empty tables and blank rates", async () => {
    h.listProspectsForExport.mockResolvedValue([]);
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(rowsOf(workbook, "Funnel")[0]).toMatchObject({ "Prospects reached": 0, "Share of all prospects": null });
    expect(rowsOf(workbook, "Handoffs")).toEqual([]);
    expect(h.getHandoffStatusForProspect).not.toHaveBeenCalled();
  });
});
