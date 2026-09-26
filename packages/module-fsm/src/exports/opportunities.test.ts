import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { OpportunityExportRow } from "./queries";

// EXP-FSM-04 -- Service opportunities export.

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const listOpportunitiesForExport = vi.hoisted(() => vi.fn(async () => rows.value));
vi.mock("./queries", () => ({ listOpportunitiesForExport }));

import { fsmOpportunitiesExport } from "./opportunities";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-1",
  userEmail: null,
  format: "csv",
  scope: "view",
};

async function csv(workbook: ExportWorkbookDefinition): Promise<string[]> {
  const file = await renderExport(workbook, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const opportunity = (overrides: Partial<OpportunityExportRow>): OpportunityExportRow =>
  ({
    id: "opp-1",
    business_id: "biz-a",
    number: "OPP-1",
    party_id: "party-1",
    party_name: "Asha Traders",
    service_type_name: "AC service",
    status: "estimate_sent",
    source: "crm",
    source_reference: "crm-opp-secret-id",
    lost_reason: null,
    description: "Two units",
    created_at: "2026-09-01T04:30:00Z",
    estimate_number: "EST-7",
    estimate_total: 12000,
    ...overrides,
  }) as OpportunityExportRow;

beforeEach(() => {
  rows.value = [opportunity({}), opportunity({ id: "opp-2", number: "OPP-2", status: "lost", source: "manual", lost_reason: "Price", estimate_number: null, estimate_total: null, description: null, service_type_name: null })];
  listOpportunitiesForExport.mockClear();
});

describe("fsm.opportunities (EXP-FSM-04)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmOpportunitiesExport).toMatchObject({ id: "fsm.opportunities", module: "fsm", permissions: [] });
  });

  it("reads the resolved business, ignoring any tenant id in the request", async () => {
    const filters = fsmOpportunitiesExport.parseFilters!(new URLSearchParams("businessId=biz-b&owner=kunal"));
    expect(filters).toEqual({});
    await fsmOpportunitiesExport.load(context, filters);
    expect(listOpportunitiesForExport).toHaveBeenCalledWith("biz-a");
  });

  it("writes labels, the estimate value, and blank where there is no estimate", async () => {
    const [header, first, second] = await csv(await fsmOpportunitiesExport.load(context, {}));
    expect(header).toBe("Opportunity #,Customer,Service type,Status,Estimate value,Estimate #,Source,Lost reason,Description,Created");
    expect(first).toBe("OPP-1,Asha Traders,AC service,Estimate Sent,12000,EST-7,CRM,,Two units,2026-09-01T10:00:00+05:30");
    expect(second).toBe("OPP-2,Asha Traders,,Lost,,,Manual,Price,,2026-09-01T10:00:00+05:30");
  });

  it("does not leak linked-record ids", async () => {
    const text = (await csv(await fsmOpportunitiesExport.load(context, {}))).join("\n");
    expect(text).not.toMatch(/crm-opp-secret-id|party-1|opp-1\b/);
  });
});
