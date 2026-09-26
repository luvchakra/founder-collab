import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-15 -- Finance Exceptions export (and the GSTR-2B / IMS reconciliation queue).

const q = vi.hoisted(() => ({ listFinanceExceptions: vi.fn(), listReconciliationExceptions: vi.fn(), listAuditActors: vi.fn() }));
vi.mock("../lib/exceptions-queue/queries", () => ({ listFinanceExceptions: q.listFinanceExceptions }));
vi.mock("../lib/exceptions/queries", () => ({ listReconciliationExceptions: q.listReconciliationExceptions }));
vi.mock("@cofounderai/core/audit/queries", () => ({ listAuditActors: q.listAuditActors }));

import { financeExceptionsExport, financeReconciliationExceptionsExport } from "./exceptions";
import { TENANT, csvLines, everyValue, headers, rowValues, runAdapter } from "./test-support";

const base = {
  businessId: TENANT,
  statusHistory: [{ status: "open", note: "internal note", at: "2026-09-01T00:00:00Z", by: "user-1" }],
  createdAt: "2026-09-01T04:30:00Z",
  updatedAt: "2026-09-02T04:30:00Z",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.listFinanceExceptions.mockReset().mockResolvedValue([
    {
      ...base,
      id: "x-1",
      exceptionType: "filing_blocker",
      referenceKey: "2026-08:bank",
      summary: "Bank not reconciled",
      impact: "Return may be wrong",
      suggestedAction: null,
      ownerId: "user-1",
      status: "in_review",
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
    },
  ]);
  q.listReconciliationExceptions.mockReset().mockResolvedValue([
    {
      ...base,
      id: "r-1",
      returnPeriod: "2026-08",
      exceptionType: "missing_in_2b",
      referenceKey: "27ABCDE1234F1Z5",
      summary: "Supplier purchases missing from GSTR-2B",
      status: "resolved",
      resolutionNote: "Supplier filed late",
      resolvedBy: "user-gone",
      resolvedAt: "2026-09-03T04:30:00Z",
    },
  ]);
  q.listAuditActors.mockReset().mockResolvedValue([{ id: "user-1", name: "Asha Rao" }]);
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-15 finance.exceptions", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financeExceptionsExport.id).toBe("finance.exceptions");
    expect(financeExceptionsExport.module).toBe("gst");
    expect(financeExceptionsExport.permissions).toEqual([]);
    await runAdapter(financeExceptionsExport, { status: "open" });
    expect(q.listFinanceExceptions).toHaveBeenCalledWith(TENANT);
    expect(q.listAuditActors).toHaveBeenCalledWith(TENANT);
  });

  it("writes exception, category, period, owner by name, status label, resolution and timestamps", async () => {
    const { workbook } = await runAdapter(financeExceptionsExport);
    expect(headers(workbook, "Exceptions")).toEqual([
      "Exception", "Category", "Impact", "Reference", "Period", "Suggested action", "Owner", "Status",
      "Resolution", "Resolved by", "Resolved", "Created", "Updated",
    ]);
    expect(rowValues(workbook, "Exceptions")).toMatchObject({
      Category: "Filing blocker",
      Period: "2026-08",
      "Suggested action": null,
      Owner: "Asha Rao",
      Status: "In review",
      "Resolved by": null,
    });
    expect((await csvLines(workbook))[1]).toContain(",2026-09-01T10:00:00+05:30,2026-09-02T10:00:00+05:30");
    expect(everyValue(workbook)).not.toContain("internal note");
  });
});

describe("EXP-FIN-15 finance.reconciliation-exceptions", () => {
  it("reads the page's ?period (this month when absent) for the context tenant", async () => {
    expect(financeReconciliationExceptionsExport.module).toBe("gst");
    expect(financeReconciliationExceptionsExport.permissions).toEqual([]);
    await runAdapter(financeReconciliationExceptionsExport, { period: "2026-08" });
    expect(q.listReconciliationExceptions).toHaveBeenCalledWith(TENANT, "2026-08");
    await runAdapter(financeReconciliationExceptionsExport);
    expect(q.listReconciliationExceptions).toHaveBeenLastCalledWith(TENANT, "2026-09");
  });

  it("labels type and status, and keeps an unknown resolver's id rather than guessing", async () => {
    const { workbook } = await runAdapter(financeReconciliationExceptionsExport, { period: "2026-08" });
    expect(rowValues(workbook, "Reconciliation exceptions")).toMatchObject({
      Category: "Missing in GSTR-2B",
      "Return period": "2026-08",
      Status: "Resolved",
      Resolution: "Supplier filed late",
      "Resolved by": "user-gone",
    });
  });
});
