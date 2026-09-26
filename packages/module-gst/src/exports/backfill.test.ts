import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-17 (Backfill) -- Finance backfill scan export.

const q = vi.hoisted(() => ({ scanFinanceBackfill: vi.fn() }));
vi.mock("../lib/backfill/queries", () => ({ scanFinanceBackfill: q.scanFinanceBackfill }));

import { financeBackfillExport } from "./backfill";
import { TENANT, csvLines, headers, runAdapter } from "./test-support";

beforeEach(() => {
  q.scanFinanceBackfill.mockReset().mockResolvedValue({
    documents: [{ kind: "document", id: "d-1", documentId: "d-1", label: "Invoice INV-7" }],
    paymentAllocations: [{ kind: "payment_allocation", id: "pa-1", documentId: "d-1", label: "Payment on Invoice INV-7" }],
  });
});

describe("EXP-FIN-17 finance.backfill", () => {
  it("is Finance-licensed with the page's (empty) read permission and scans only the context tenant", async () => {
    expect(financeBackfillExport.id).toBe("finance.backfill");
    expect(financeBackfillExport.module).toBe("gst");
    expect(financeBackfillExport.permissions).toEqual([]);
    await runAdapter(financeBackfillExport);
    expect(q.scanFinanceBackfill).toHaveBeenCalledWith(TENANT);
  });

  it("writes the pending items by kind label, with the counts in the workbook info", async () => {
    const { workbook } = await runAdapter(financeBackfillExport);
    expect(headers(workbook, "Pending backfill")).toEqual(["Kind", "Item", "Document id", "Status"]);
    const lines = await csvLines(workbook);
    expect(lines.slice(1)).toEqual([
      "Document,Invoice INV-7,d-1,Not yet posted",
      "Payment allocation,Payment on Invoice INV-7,d-1,Not yet posted",
    ]);
    expect(workbook.metadata).toEqual({ "Documents to post": "1", "Payment allocations to post": "1" });
  });
});
