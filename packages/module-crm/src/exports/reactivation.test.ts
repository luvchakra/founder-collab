import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-06 -- Reactivation export.

const mocks = vi.hoisted(() => ({ listReactivationOpportunities: vi.fn() }));
vi.mock("../lib/reactivation/queries", () => ({ listReactivationOpportunities: mocks.listReactivationOpportunities }));

import { crmReactivationExport } from "./reactivation";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listReactivationOpportunities.mockResolvedValue([
    { partyId: "p1", partyName: "Asha", reason: "inactive", detail: "No interaction since 2026-06-01", suggestedAction: "Send a check-in message" },
  ]);
});

describe("crm.reactivation (EXP-CRM-06)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmReactivationExport.id).toBe("crm.reactivation");
    expect(crmReactivationExport.module).toBe("crm");
    expect(crmReactivationExport.permissions).toEqual(["crm.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmReactivationExport.load(exportContext(), crmReactivationExport.parseFilters!(requestParams()));
    expect(mocks.listReactivationOpportunities).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports reason labels and marks the recommendation as rule-based", async () => {
    const workbook = await crmReactivationExport.load(exportContext(), {});
    expect(headers(workbook, "Reactivation")).toEqual(["Customer", "Reactivation reason", "Signal detail", "Recommended action", "Recommendation source"]);
    expect(rowsOf(workbook, "Reactivation")[0]).toEqual({
      Customer: "Asha",
      "Reactivation reason": "Previously active, now inactive",
      "Signal detail": "No interaction since 2026-06-01",
      "Recommended action": "Send a check-in message",
      "Recommendation source": "Rule-based signal",
    });
  });

  it("exports an empty list as headers only", async () => {
    mocks.listReactivationOpportunities.mockResolvedValue([]);
    const workbook = await crmReactivationExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Reactivation")).toEqual([]);
  });
});
