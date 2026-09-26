import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-04 -- CRM Analytics export.

const mocks = vi.hoisted(() => ({
  getResponsePerformance: vi.fn(),
  getDiscoveryCrmFunnel: vi.fn(),
  getCrmFsmFunnel: vi.fn(),
  getChannelPerformance: vi.fn(),
}));
vi.mock("../lib/dashboard/response-performance", () => ({ getResponsePerformance: mocks.getResponsePerformance }));
vi.mock("../lib/dashboard/discovery-funnel", () => ({ getDiscoveryCrmFunnel: mocks.getDiscoveryCrmFunnel }));
vi.mock("../lib/dashboard/fsm-funnel", () => ({ getCrmFsmFunnel: mocks.getCrmFsmFunnel }));
vi.mock("../lib/dashboard/channel-performance", () => ({ getChannelPerformance: mocks.getChannelPerformance }));

import { crmAnalyticsExport } from "./analytics";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getResponsePerformance.mockResolvedValue({
    medianFirstResponseMinutes: null,
    slaCompliancePercent: null,
    unresolvedByAge: [
      { bucket: "0-1 day", count: 0 },
      { bucket: "7+ days", count: 2 },
    ],
    ownerPerformance: [{ ownerId: null, ownerName: "Unassigned", responded: 3, medianResponseMinutes: 15 }],
    channelResponseTime: [{ channel: "whatsapp", medianResponseMinutes: 12 }],
  });
  mocks.getDiscoveryCrmFunnel.mockResolvedValue({ discovered: 10, contacted: 6, engaged: 4, qualified: 2, opportunity: 1, won: 0 });
  mocks.getCrmFsmFunnel.mockResolvedValue(null);
  mocks.getChannelPerformance.mockResolvedValue([{ channel: "whatsapp", responded: 3, qualifiedLeads: 1, opportunities: 1, wins: 1, revenue: 9000 }]);
});

describe("crm.analytics (EXP-CRM-04)", () => {
  it("is gated by the CRM dashboards-and-analytics permission", () => {
    expect(crmAnalyticsExport.id).toBe("crm.analytics");
    expect(crmAnalyticsExport.module).toBe("crm");
    expect(crmAnalyticsExport.permissions).toEqual(["analytics.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmAnalyticsExport.load(exportContext(), crmAnalyticsExport.parseFilters!(requestParams()));
    for (const fn of Object.values(mocks)) expect(fn).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("has one sheet per analytics dataset", async () => {
    const workbook = await crmAnalyticsExport.load(exportContext(), {});
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Response Performance",
      "Owner Performance",
      "Channel Response Time",
      "Discovery Funnel",
      "FSM Funnel",
      "Channel Performance",
    ]);
    expect(headers(workbook, "Channel Performance")).toEqual(["Channel", "Responded", "Qualified leads", "Opportunities", "Wins", "Revenue (won value)"]);
  });

  it("keeps unreported response metrics blank with the reason", async () => {
    const workbook = await crmAnalyticsExport.load(exportContext(), {});
    const rows = rowsOf(workbook, "Response Performance");
    expect(rows.find((r) => r.Metric === "Median first response")).toMatchObject({ Minutes: null, Note: "No responded interactions in the last 30 days" });
    expect(rows.find((r) => r.Metric === "7+ days")).toMatchObject({ Count: 2 });
    expect(rowsOf(workbook, "Channel Response Time")[0]).toEqual({ Channel: "WhatsApp", "Median response (minutes)": 12 });
  });

  it("labels an unlicensed module's funnel as unavailable instead of zeros", async () => {
    const workbook = await crmAnalyticsExport.load(exportContext(), {});
    const fsm = rowsOf(workbook, "FSM Funnel");
    expect(fsm).toHaveLength(6);
    expect(fsm.every((r) => r.Count === null && r["Amount (INR)"] === null && r.Source === "FSM unavailable")).toBe(true);
    const discovery = rowsOf(workbook, "Discovery Funnel");
    expect(discovery[0]).toEqual({ Stage: "Discovered", Count: 10, "Amount (INR)": null, Source: "Discovery" });
    expect(discovery[5]).toEqual({ Stage: "Won", Count: 0, "Amount (INR)": null, Source: "CRM" });
  });

  it("labels Discovery unavailable the same way", async () => {
    mocks.getDiscoveryCrmFunnel.mockResolvedValue(null);
    mocks.getCrmFsmFunnel.mockResolvedValue({ opportunity: 4, quote: 2, accepted: 1, job: 1, completed: 1, revenue: 5000 });
    const workbook = await crmAnalyticsExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Discovery Funnel").every((r) => r.Count === null && r.Source === "Discovery unavailable")).toBe(true);
    expect(rowsOf(workbook, "FSM Funnel").find((r) => r.Stage === "Revenue")).toEqual({ Stage: "Revenue", Count: null, "Amount (INR)": 5000, Source: "FSM" });
  });
});
