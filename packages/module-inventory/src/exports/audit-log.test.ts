import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-12 -- Inventory audit log export.

const mocks = vi.hoisted(() => ({ listAuditLogForBusiness: vi.fn(), listAuditActors: vi.fn(), listAuditLogForExport: vi.fn() }));
vi.mock("@cofounderai/core/audit/queries", () => ({ listAuditLogForBusiness: mocks.listAuditLogForBusiness, listAuditActors: mocks.listAuditActors }));
vi.mock("./queries", () => ({ listAuditLogForExport: mocks.listAuditLogForExport }));

import { inventoryAuditLogExport, parseAuditFilters, summarizeAuditChange } from "./audit-log";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

const ENTRY = {
  id: "e1",
  business_id: BUSINESS_ID,
  actor_id: "u1",
  action: "document.status_changed",
  entity_type: "document",
  entity_id: "doc-1",
  before: { status: "draft", api_key: "sk_live_should_not_leak", config: { token: "nested-secret" } },
  after: { status: "approved", api_key: "sk_live_rotated_key", config: { token: "nested-secret-2" } },
  created_at: "2026-09-20T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAuditLogForBusiness.mockResolvedValue([ENTRY]);
  mocks.listAuditLogForExport.mockResolvedValue([ENTRY, { ...ENTRY, id: "e2", actor_id: null, before: null, after: { quantity: 5, reason: "cycle count" }, action: "stock.adjusted", entity_type: "stock_movement" }]);
  mocks.listAuditActors.mockResolvedValue([{ id: "u1", name: "Kunal" }]);
});

describe("inventory.audit-log (EXP-INV-12)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryAuditLogExport.id).toBe("inventory.audit-log");
    expect(inventoryAuditLogExport.module).toBe("inventory");
    expect(inventoryAuditLogExport.permissions).toEqual(["inventory.view"]);
  });

  it("parses the page's filters; malformed dates and unknown params are ignored", () => {
    expect(parseAuditFilters(requestParams())).toEqual({ entityType: "", actorId: "", dateFrom: "", dateTo: "" });
    expect(parseAuditFilters(requestParams({ entityType: "document", actorId: "u1", dateFrom: "2026-09-01", dateTo: "not-a-date" }))).toEqual({
      entityType: "document",
      actorId: "u1",
      dateFrom: "2026-09-01",
      dateTo: "",
    });
  });

  it("view = the page's 200 newest; all = every match; both for the resolved business with the same filters", async () => {
    const filters = parseAuditFilters(requestParams({ entityType: "document", dateFrom: "2026-09-01", dateTo: "2026-09-30" }));
    const expected = { entityType: "document", actorId: undefined, dateFrom: "2026-09-01", dateTo: "2026-09-30" };
    await inventoryAuditLogExport.load(exportContext({ scope: "view" }), filters);
    expect(mocks.listAuditLogForBusiness).toHaveBeenCalledWith(BUSINESS_ID, expected);
    expect(mocks.listAuditLogForExport).not.toHaveBeenCalled();
    const all = await inventoryAuditLogExport.load(exportContext({ scope: "all" }), filters);
    expect(mocks.listAuditLogForExport).toHaveBeenCalledWith(BUSINESS_ID, expected);
    expect(mocks.listAuditActors).toHaveBeenCalledWith(BUSINESS_ID);
    expect(rowsOf(all, "Audit Log")).toHaveLength(2);
  });

  it("exports labelled rows with a summary instead of raw before/after", async () => {
    const workbook = await inventoryAuditLogExport.load(exportContext({ scope: "all" }), parseAuditFilters(requestParams()));
    expect(headers(workbook, "Audit Log")).toEqual(["Timestamp", "Actor", "Entity", "Action", "Entity ID", "Summary"]);
    const [first, second] = rowsOf(workbook, "Audit Log");
    expect(first).toMatchObject({ Actor: "Kunal", Entity: "Document", Action: "Document status changed", "Entity ID": "doc-1", Summary: "status: draft -> approved, api_key changed, config changed" });
    expect(second).toMatchObject({ Actor: "System", Entity: "Stock Movement", Action: "Stock adjusted", Summary: "quantity: 5, reason: cycle count" });
    const text = serialized(workbook);
    for (const secret of ["sk_live", "nested-secret"]) expect(text).not.toContain(secret);
  });

  it("never writes long opaque values", () => {
    expect(summarizeAuditChange({ before: null, after: { ref: "a".repeat(40) } })).toBe("ref recorded");
    expect(summarizeAuditChange({ before: null, after: null })).toBe("");
  });
});
