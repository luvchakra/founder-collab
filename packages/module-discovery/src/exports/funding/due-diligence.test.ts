// EXP-FND-10 -- Due diligence export: the queue with the page's "Show" filter.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listDiligence: vi.fn(), listRounds: vi.fn() }));
vi.mock("../../lib/funding/queries", () => ({ listDiligence: h.listDiligence, listRounds: h.listRounds }));

import { fundingDueDiligenceExport } from "./due-diligence";
import { BUSINESS_ID, ROUND_ID, allCellText, exportContext, headers, params, round, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round()]);
  h.listDiligence.mockResolvedValue([
    {
      id: "dd-1",
      investorId: "i-1",
      investorName: "Blue Fund",
      roundId: ROUND_ID,
      request: "Last 2 years' audited financials",
      requester: "Priya Rao",
      dueAt: "2020-01-01",
      status: "needs_clarification",
      response: "DRAFT RESPONSE TEXT",
      notes: null,
      dataRoomItemIds: ["d-1", "d-2"],
      decidedAt: null,
      updatedAt: "2026-09-22T00:00:00Z",
    },
  ]);
});

describe("EXP-FND-10 funding.due-diligence", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingDueDiligenceExport.id).toBe("funding.due-diligence");
    expect(fundingDueDiligenceExport.module).toBe("discovery");
    expect(fundingDueDiligenceExport.permissions).toEqual(["funding.view"]);
  });

  it("maps the page's Show filter to the query, with the context's business", async () => {
    const cases: [Record<string, string>, unknown][] = [
      [{}, "active"],
      [{ status: "all" }, undefined],
      [{ status: "accepted" }, "accepted"],
      [{ status: "bogus" }, "active"],
    ];
    for (const [input, expected] of cases) {
      h.listDiligence.mockClear();
      await fundingDueDiligenceExport.load(exportContext(), fundingDueDiligenceExport.parseFilters!(params(input)));
      expect(h.listDiligence).toHaveBeenCalledWith(BUSINESS_ID, expected);
    }
  });

  it("exports the queue fields with labels, not the response text", async () => {
    const wb = await fundingDueDiligenceExport.load(exportContext(), { status: "active" });
    expect(headers(wb, "Due diligence")).toEqual(["Request", "Investor", "Requester", "Round", "Due", "Overdue", "Status", "Evidence documents", "Decided", "Last update"]);
    expect(rowValues(wb, "Due diligence")).toMatchObject({ Investor: "Blue Fund", Round: "Seed 2026", Status: "Needs clarification", Overdue: true, "Evidence documents": 2, Decided: null });
    expect(allCellText(wb)).not.toContain("DRAFT RESPONSE TEXT");
  });
});
