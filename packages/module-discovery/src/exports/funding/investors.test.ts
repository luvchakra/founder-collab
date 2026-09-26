// EXP-FND-05 -- Investors list export: the page's status and type filters, every
// matching investor, stage in the live round, primary contact.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listInvestorsForExport: vi.fn(),
  primaryContactsForExport: vi.fn(),
  listRounds: vi.fn(),
  listPipeline: vi.fn(),
}));
vi.mock("./queries", () => ({ listInvestorsForExport: h.listInvestorsForExport, primaryContactsForExport: h.primaryContactsForExport }));
vi.mock("../../lib/funding/queries", () => ({
  listRounds: h.listRounds,
  listPipeline: h.listPipeline,
  pickActiveRound: (rounds: { status: string }[]) => rounds.find((r) => r.status === "open") ?? null,
}));

import { fundingInvestorsExport } from "./investors";
import { BUSINESS_ID, ROUND_ID, exportContext, headers, investor, params, pipelineRecord, round, rowValues, sheet } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listInvestorsForExport.mockResolvedValue([investor(), investor({ id: "i-2", partyId: "party-2", name: "Angel A", investorType: "angel" })]);
  h.primaryContactsForExport.mockResolvedValue(new Map([["party-1", { name: "Priya Rao", email: "priya@bluefund.example", jobTitle: "Partner" }]]));
  h.listRounds.mockResolvedValue([round()]);
  h.listPipeline.mockResolvedValue([pipelineRecord()]);
});

describe("EXP-FND-05 funding.investors", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingInvestorsExport.id).toBe("funding.investors");
    expect(fundingInvestorsExport.module).toBe("discovery");
    expect(fundingInvestorsExport.permissions).toEqual(["funding.view"]);
  });

  it("parses the page's filters and reads the context's business only", async () => {
    const filters = fundingInvestorsExport.parseFilters!(params({ status: "archived", type: "vc", businessId: "x" }));
    expect(filters).toEqual({ status: "archived", type: "vc" });
    await fundingInvestorsExport.load(exportContext(), filters);
    expect(h.listInvestorsForExport).toHaveBeenCalledWith(BUSINESS_ID, "archived");
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID, { roundId: ROUND_ID });
    expect(h.primaryContactsForExport).toHaveBeenCalledWith(BUSINESS_ID, ["party-1"]);
    expect(fundingInvestorsExport.parseFilters!(params({ status: "weird", type: "nope" }))).toEqual({ status: "active", type: null });
  });

  it("exports the list fields with labels; missing amounts stay blank", async () => {
    const wb = await fundingInvestorsExport.load(exportContext(), { status: "active", type: null });
    expect(headers(wb, "Investors")).toEqual([
      "Investor", "Type", "Geography", "Stage preference", "Sector preference", "Cheque min", "Cheque max", "Currency", "Source",
      "Source note", "Status", "Website", "Email", "Primary contact", "Primary contact email", "Research", "Last researched",
      "Active round", "Pipeline stage", "Added",
    ]);
    expect(rowValues(wb, "Investors", 0)).toMatchObject({
      Investor: "Blue Fund",
      Type: "VC",
      Geography: ["India", "SEA"],
      "Cheque min": 2_000_000,
      "Cheque max": null,
      Source: "Founder network",
      "Primary contact": "Priya Rao",
      Research: "Not researched",
      "Active round": "Seed 2026",
      "Pipeline stage": "Meeting",
    });
    expect(rowValues(wb, "Investors", 1)).toMatchObject({ Investor: "Angel A", Type: "Angel", "Primary contact": null, "Pipeline stage": null });
  });

  it("applies the type filter the way the page does", async () => {
    const wb = await fundingInvestorsExport.load(exportContext(), { status: "active", type: "angel" });
    expect(sheet(wb, "Investors").rows).toHaveLength(1);
  });
});
