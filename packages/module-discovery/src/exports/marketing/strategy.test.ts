// EXP-MKT-02 -- Marketing strategy export: the selected (or current) version, its goals
// and the version history, looked up only among the business's own strategies.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingStrategy } from "../../lib/marketing/types";

const h = vi.hoisted(() => ({ listStrategies: vi.fn(), listOfferingOptions: vi.fn() }));
vi.mock("../../lib/marketing/queries", async () => {
  const pick = (strategies: MarketingStrategy[]) =>
    strategies.find((s) => s.offeringId === null && s.status === "active") ?? strategies[0] ?? null;
  return { listStrategies: h.listStrategies, listOfferingOptions: h.listOfferingOptions, pickCurrentStrategy: pick };
});

import { marketingStrategyExport } from "./strategy";
import { BUSINESS_ID, exportContext, headers, params, rowValues, sheet } from "./test-support";

const V1 = "33333333-3333-4333-8333-333333333331";
const V2 = "33333333-3333-4333-8333-333333333332";

function strategy(overrides: Partial<MarketingStrategy> = {}): MarketingStrategy {
  return {
    id: V1,
    businessId: BUSINESS_ID,
    offeringId: null,
    name: "Company strategy",
    status: "active",
    versionNumber: 1,
    origin: "user",
    positioning: { statement: "Payroll that just works", targetProblem: "Late salaries" },
    valueProposition: { proofPoints: ["40 customers", "99.9% on-time"] },
    differentiation: {},
    targetMarkets: { buyerSegments: ["HR heads"] },
    messaging: { objections: [{ objection: "Too pricey", response: "Pays back in 3 months" }] },
    channels: ["linkedin", "paid_search"],
    goals: [{ name: "Pipeline", metric: "qualified leads", target: 40, period: "Q4", status: "on_track" }],
    updatedAt: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listStrategies.mockResolvedValue([strategy({ id: V2, versionNumber: 2, status: "draft", origin: "ai_draft", goals: [] }), strategy()]);
  h.listOfferingOptions.mockResolvedValue([]);
});

describe("EXP-MKT-02 marketing.strategy", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingStrategyExport.id).toBe("marketing.strategy");
    expect(marketingStrategyExport.module).toBe("discovery");
    expect(marketingStrategyExport.permissions).toEqual(["marketing.view"]);
  });

  it("reads the context's business only and exports the current version by default", async () => {
    const wb = await marketingStrategyExport.load(exportContext(), marketingStrategyExport.parseFilters!(params()));
    expect(h.listStrategies).toHaveBeenCalledWith(BUSINESS_ID);
    expect(headers(wb, "Strategy")).toEqual(["Section", "Field", "Value"]);
    const values = Object.fromEntries((sheet(wb, "Strategy").rows as { field: string; value: unknown }[]).map((r) => [r.field, r.value]));
    expect(values).toMatchObject({
      Version: "v1",
      Status: "Active",
      Origin: "Written by a person",
      "Target problem": "Late salaries",
      "Proof points": ["40 customers", "99.9% on-time"],
      "Buyer segments": ["HR heads"],
      Objections: ["Too pricey -> Pays back in 3 months"],
      Channels: ["LinkedIn", "Paid search"],
    });
    expect(rowValues(wb, "Goals")).toEqual({ Goal: "Pipeline", Metric: "qualified leads", Target: 40, Period: "Q4", Status: "On track" });
  });

  it("exports the version the page is showing, and the whole history", async () => {
    const wb = await marketingStrategyExport.load(exportContext(), marketingStrategyExport.parseFilters!(params({ version: V2 })));
    expect(wb.metadata?.Version).toBe("v2 · Company strategy");
    expect(sheet(wb, "Goals").rows).toHaveLength(0);
    expect(rowValues(wb, "Versions", 0)).toMatchObject({ Version: 2, Status: "Draft", Origin: "AI draft", Scope: "Whole company" });
    expect(sheet(wb, "Versions").rows).toHaveLength(2);
  });

  it("ignores a version id that is not one of this business's strategies", async () => {
    const wb = await marketingStrategyExport.load(exportContext(), marketingStrategyExport.parseFilters!(params({ version: "44444444-4444-4444-8444-444444444444" })));
    expect(wb.metadata?.Version).toBe("v1 · Company strategy");
  });

  it("is a valid empty workbook when there is no strategy yet", async () => {
    h.listStrategies.mockResolvedValue([]);
    const wb = await marketingStrategyExport.load(exportContext(), marketingStrategyExport.parseFilters!(params()));
    expect(sheet(wb, "Strategy").rows).toHaveLength(0);
    expect(wb.metadata?.Version).toBe("No strategy yet");
  });
});
