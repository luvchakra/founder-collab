// EXP-FND-07 -- Investor pipeline export (from the round page): the round loaded with
// the context's business, records in stage order with age and source.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getRound: vi.fn(), listPipeline: vi.fn(), listStageHistory: vi.fn(), listInvestorsForExport: vi.fn() }));
vi.mock("../../lib/funding/queries", () => ({ getRound: h.getRound, listPipeline: h.listPipeline, listStageHistory: h.listStageHistory }));
vi.mock("./queries", () => ({ listInvestorsForExport: h.listInvestorsForExport }));

import { fundingPipelineExport } from "./pipeline";
import { BUSINESS_ID, ROUND_ID, exportContext, headers, investor, params, pipelineRecord, round, rowValues, sheet } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.getRound.mockResolvedValue(round());
  h.listPipeline.mockResolvedValue([
    pipelineRecord({ id: "pl-c", stage: "committed", committedAmount: 1_000_000 }),
    pipelineRecord({ id: "pl-p", investorId: "i-2", investorName: "Angel A", stage: "passed", passReason: "Too early" }),
    pipelineRecord({ id: "pl-m" }),
  ]);
  h.listStageHistory.mockResolvedValue([
    { pipelineId: "pl-m", fromStage: "contacted", toStage: "meeting", changedAt: "2026-09-20T00:00:00Z" },
    { pipelineId: "pl-c", fromStage: null, toStage: "meeting", changedAt: "2026-09-01T00:00:00Z" },
    { pipelineId: "pl-c", fromStage: "meeting", toStage: "committed", changedAt: "2026-09-05T00:00:00Z" },
  ]);
  h.listInvestorsForExport.mockResolvedValue([investor()]);
});

describe("EXP-FND-07 funding.pipeline", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingPipelineExport.id).toBe("funding.pipeline");
    expect(fundingPipelineExport.module).toBe("discovery");
    expect(fundingPipelineExport.permissions).toEqual(["funding.view"]);
  });

  it("loads the round with the context's business, never one from the request", async () => {
    await fundingPipelineExport.load(exportContext(), fundingPipelineExport.parseFilters!(params({ roundId: ROUND_ID })));
    expect(h.getRound).toHaveBeenCalledWith(BUSINESS_ID, ROUND_ID);
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID, { roundId: ROUND_ID });
    expect(h.listStageHistory).toHaveBeenCalledWith(BUSINESS_ID, ROUND_ID);
    expect(h.listInvestorsForExport).toHaveBeenCalledWith(BUSINESS_ID, "all");
  });

  it("is a 404 for another business's round", async () => {
    h.getRound.mockResolvedValue(null);
    await expect(fundingPipelineExport.load(exportContext(), { roundId: ROUND_ID })).rejects.toMatchObject({ status: 404 });
  });

  it("exports records in the page's stage order, with labels and blanks kept blank", async () => {
    const wb = await fundingPipelineExport.load(exportContext(), { roundId: ROUND_ID });
    expect(headers(wb, "Pipeline").slice(0, 8)).toEqual(["Investor", "Round", "Stage", "Previous stage", "Stage entered", "Days in stage", "Source", "Committed amount"]);
    expect((sheet(wb, "Pipeline").rows as { stage: string }[]).map((r) => r.stage)).toEqual(["meeting", "committed", "passed"]);
    expect(rowValues(wb, "Pipeline", 0)).toMatchObject({ Investor: "Blue Fund", Round: "Seed 2026", Stage: "Meeting", Source: "Founder network", "Committed amount": null });
    expect(rowValues(wb, "Pipeline", 1)).toMatchObject({ Stage: "Committed", "Committed amount": 1_000_000 });
    expect(rowValues(wb, "Pipeline", 2)).toMatchObject({ Investor: "Angel A", Stage: "Passed", Source: null, "Pass reason": "Too early" });
    expect(typeof rowValues(wb, "Pipeline", 0)["Days in stage"]).toBe("number");
    expect(rowValues(wb, "Funnel", 4)).toMatchObject({ Stage: "Meeting", "Reached (from stage history)": 2, "Median days in stage": 4 });
  });
});
