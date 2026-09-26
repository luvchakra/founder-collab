import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-17 (Activation) -- Finance activation checklist export.

const q = vi.hoisted(() => ({ getActivationSummary: vi.fn() }));
vi.mock("../lib/activation/queries", () => ({ getActivationSummary: q.getActivationSummary }));

import { financeActivationExport } from "./activation";
import { TENANT, csvLines, rowValues, runAdapter } from "./test-support";

beforeEach(() => {
  q.getActivationSummary.mockReset().mockResolvedValue({
    businessName: "Acme Traders",
    settings: { accountingMethod: "cash", fiscalYearStartMonth: 4 },
    steps: [
      { key: "chart_of_accounts", label: "Chart of accounts", complete: true, detail: "42 accounts", linkSlug: "accounts" },
      { key: "bank_accounts", label: "Bank accounts", complete: false, detail: "Add your first bank account" },
    ],
    activation: { activatedAt: null, activatedBy: null },
  });
});

describe("EXP-FIN-17 finance.activation", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financeActivationExport.id).toBe("finance.activation");
    expect(financeActivationExport.module).toBe("gst");
    expect(financeActivationExport.permissions).toEqual([]);
    await runAdapter(financeActivationExport);
    expect(q.getActivationSummary).toHaveBeenCalledWith(TENANT);
  });

  it("writes the checklist and the settings by label; a never-activated date stays blank", async () => {
    const { workbook } = await runAdapter(financeActivationExport);
    expect((await csvLines(workbook)).slice(0, 3)).toEqual([
      "Step,Status,Complete,Detail",
      "Chart of accounts,Done,Yes,42 accounts",
      "Bank accounts,To do,No,Add your first bank account",
    ]);
    expect(rowValues(workbook, "Settings", 0)).toEqual({ Setting: "Accounting method", Value: "Cash", Date: null });
    expect(rowValues(workbook, "Settings", 1)).toMatchObject({ Value: "April" });
    expect(rowValues(workbook, "Settings", 2)).toEqual({ Setting: "Finance activated", Value: "No", Date: null });
  });
});
