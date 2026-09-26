import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-17 (Audit) -- Finance audit log export.

const q = vi.hoisted(() => ({ listAuditLogForExport: vi.fn(), listAuditActors: vi.fn() }));
vi.mock("./queries", () => ({ listAuditLogForExport: q.listAuditLogForExport }));
vi.mock("@cofounderai/core/audit/queries", () => ({ listAuditActors: q.listAuditActors }));

import { financeAuditLogExport } from "./audit-log";
import { TENANT, everyValue, headers, rowValues, runAdapter } from "./test-support";

beforeEach(() => {
  q.listAuditLogForExport.mockReset().mockResolvedValue([
    {
      id: "log-1",
      business_id: TENANT,
      actor_id: "user-1",
      action: "export.generated",
      entity_type: "export",
      entity_id: null,
      before: null,
      after: { module: "finance", format: "csv" },
      created_at: "2026-09-20T04:30:00Z",
    },
    {
      id: "log-2",
      business_id: TENANT,
      actor_id: null,
      action: "custom.thing",
      entity_type: "mystery",
      entity_id: "11111111-1111-1111-1111-111111111111",
      before: { hidden_before_field: "x" },
      after: { hidden_before_field: "x" },
      created_at: "2026-09-19T04:30:00Z",
    },
  ]);
  q.listAuditActors.mockReset().mockResolvedValue([{ id: "user-1", name: "Asha Rao" }]);
});

describe("EXP-FIN-17 finance.audit-log", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeAuditLogExport.id).toBe("finance.audit-log");
    expect(financeAuditLogExport.module).toBe("gst");
    expect(financeAuditLogExport.permissions).toEqual([]);
  });

  it("passes the page's four filters, and only those, for the context tenant", async () => {
    const { filters } = await runAdapter(financeAuditLogExport, {
      entityType: "export",
      actorId: "user-1",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      limit: "5",
    });
    const expected = { entityType: "export", actorId: "user-1", dateFrom: "2026-09-01", dateTo: "2026-09-30" };
    expect(filters).toEqual(expected);
    expect(q.listAuditLogForExport).toHaveBeenCalledWith(TENANT, expected);
    expect(financeAuditLogExport.describeFilters!(filters)).toEqual({ Entity: "Export", Actor: "user-1", From: "2026-09-01", To: "2026-09-30" });
  });

  it("writes what the page's table shows, by label and name, never the raw snapshots", async () => {
    const { workbook } = await runAdapter(financeAuditLogExport);
    expect(headers(workbook, "Audit log")).toEqual(["When", "Actor", "Entity", "Entity id", "Action", "Details"]);
    expect(rowValues(workbook, "Audit log", 0)).toMatchObject({ Actor: "Asha Rao", Entity: "Export", Action: "Data exported", "Entity id": null });
    expect(rowValues(workbook, "Audit log", 1)).toMatchObject({ Actor: "System", Entity: "mystery", Action: "custom.thing", Details: "—" });
    expect(everyValue(workbook)).not.toContain("hidden_before_field");
  });
});
