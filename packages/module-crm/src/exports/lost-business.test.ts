import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-05 -- Potential Lost Business export.

const mocks = vi.hoisted(() => ({
  listPotentialLostBusinessQueue: vi.fn(),
  listPotentialLostBusinessQueueForExport: vi.fn(),
  listEmployeeOptions: vi.fn(),
}));
vi.mock("../lib/interactions/queries", () => ({ listPotentialLostBusinessQueue: mocks.listPotentialLostBusinessQueue }));
vi.mock("./queries", () => ({ listPotentialLostBusinessQueueForExport: mocks.listPotentialLostBusinessQueueForExport }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));

import { crmLostBusinessExport } from "./lost-business";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

const ROW = {
  interactionId: "i1",
  conversationId: "c1",
  partyId: "p1",
  channel: "instagram",
  contentExcerpt: "My card number is 4111 1111 1111 1111",
  occurredAt: "2026-09-24T04:00:00Z",
  intent: "availability",
  opportunityId: "o1",
  responseDueAt: "2026-09-24T08:00:00Z",
  ageMs: 2 * 24 * 3_600_000,
  overdue: true,
  partyName: "Meera",
  opportunityValue: 42000,
  opportunityCurrency: "INR",
  ownerId: "emp-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPotentialLostBusinessQueue.mockResolvedValue([ROW]);
  mocks.listPotentialLostBusinessQueueForExport.mockResolvedValue([ROW, { ...ROW, interactionId: "i2", partyName: null, opportunityValue: null, overdue: false, ownerId: null, intent: null }]);
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-1", full_name: null, email: "sam@example.com" }]);
});

describe("crm.lost-business (EXP-CRM-05)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmLostBusinessExport.id).toBe("crm.lost-business");
    expect(crmLostBusinessExport.module).toBe("crm");
    expect(crmLostBusinessExport.permissions).toEqual(["crm.view"]);
  });

  it("current view is the page's own 200-row queue; all matching is the uncapped query (tenant isolation both ways)", async () => {
    const filters = crmLostBusinessExport.parseFilters!(requestParams({ channel: "whatsapp" }));
    expect(filters).toEqual({});
    await crmLostBusinessExport.load(exportContext({ scope: "view" }), filters);
    expect(mocks.listPotentialLostBusinessQueue).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listPotentialLostBusinessQueueForExport).not.toHaveBeenCalled();

    const all = await crmLostBusinessExport.load(exportContext({ scope: "all" }), filters);
    expect(mocks.listPotentialLostBusinessQueueForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(rowsOf(all, "Lost Business")).toHaveLength(2);
  });

  it("exports the queue's columns as labels", async () => {
    const workbook = await crmLostBusinessExport.load(exportContext(), {});
    expect(headers(workbook, "Lost Business")).toEqual([
      "Received",
      "Age",
      "Contact",
      "Channel",
      "Message intent",
      "High commercial intent",
      "Opportunity value",
      "Currency",
      "Owner",
      "SLA",
      "Response due",
      "Resolution state",
    ]);
    expect(rowsOf(workbook, "Lost Business")[0]).toMatchObject({
      Age: "2d",
      Contact: "Meera",
      Channel: "Instagram",
      "Message intent": "Availability",
      "High commercial intent": true,
      "Opportunity value": 42000,
      Currency: "INR",
      Owner: "sam@example.com",
      SLA: "Overdue",
      "Resolution state": "Awaiting reply",
    });
  });

  it("keeps an unknown value blank, not zero", async () => {
    const workbook = await crmLostBusinessExport.load(exportContext({ scope: "all" }), {});
    expect(rowsOf(workbook, "Lost Business")[1]).toMatchObject({
      Contact: "Unknown contact",
      "Message intent": "",
      "Opportunity value": null,
      Currency: "",
      Owner: "Unassigned",
      SLA: "On track",
    });
  });

  it("excludes raw message content by default", async () => {
    const workbook = await crmLostBusinessExport.load(exportContext({ scope: "all" }), {});
    expect(serialized(workbook)).not.toContain("4111");
  });
});
