// EXP-FND-04 -- Fundraising rounds export: every round with committed and raised kept
// apart, amounts nobody supplied blank.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listRounds: vi.fn(), listPipeline: vi.fn() }));
vi.mock("../../lib/funding/queries", () => ({ listRounds: h.listRounds, listPipeline: h.listPipeline }));

import { fundingRoundsExport } from "./rounds";
import { BUSINESS_ID, exportContext, headers, params, pipelineRecord, renderText, round, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round(), round({ id: "r-2", name: "Bridge", roundType: "safe", status: "planning", targetAmount: null, openedAt: null, isPrimary: false })]);
  h.listPipeline.mockResolvedValue([
    pipelineRecord({ stage: "invested", committedAmount: 2_000_000, investedAmount: 2_000_000 }),
    pipelineRecord({ id: "pl-usd", stage: "committed", committedAmount: 50_000, currency: "USD" }),
  ]);
});

describe("EXP-FND-04 funding.rounds", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingRoundsExport.id).toBe("funding.rounds");
    expect(fundingRoundsExport.module).toBe("discovery");
    expect(fundingRoundsExport.permissions).toEqual(["funding.view"]);
  });

  it("reads the context's business only", async () => {
    expect(fundingRoundsExport.parseFilters!(params())).toEqual({});
    await fundingRoundsExport.load(exportContext(), {});
    expect(h.listRounds).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports progress per round, other currencies counted and left out", async () => {
    const wb = await fundingRoundsExport.load(exportContext(), {});
    expect(headers(wb, "Rounds").slice(0, 10)).toEqual(["Round", "Type", "Status", "Primary round", "Target", "Committed", "Raised", "Remaining", "Above target", "Currency"]);
    expect(rowValues(wb, "Rounds", 0)).toMatchObject({
      Round: "Seed 2026",
      Type: "Seed",
      Committed: 2_000_000,
      Raised: 2_000_000,
      Remaining: 8_000_000,
      "Raised share of target": 0.2,
      "Pipeline records in another currency (left out)": 1,
    });
    const bridge = rowValues(wb, "Rounds", 1);
    expect(bridge).toMatchObject({ Round: "Bridge", Type: "SAFE", Status: "Planning", Target: null, Committed: null, Raised: null, Remaining: null, "Days in round": null });
    expect((await renderText(wb)).split("\r\n")[0]).toContain("Amounts provenance");
  });
});
