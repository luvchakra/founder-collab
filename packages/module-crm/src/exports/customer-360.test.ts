import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-10 (Customer 360) -- one customer's workbook.

const mocks = vi.hoisted(() => ({
  getParty: vi.fn(),
  listContactsForParty: vi.fn(),
  listAgingForParty: vi.fn(),
  listRecentOrdersForParty: vi.fn(),
  listRecentJobsForParty: vi.fn(),
  getCustomer360: vi.fn(),
  listStages: vi.fn(),
  getBuyingIntentScore: vi.fn(),
  listEmployeeOptions: vi.fn(),
  listRelationshipTimeline: vi.fn(),
}));
vi.mock("@cofounderai/core/parties/queries", () => ({ getParty: mocks.getParty, listContactsForParty: mocks.listContactsForParty }));
vi.mock("@cofounderai/core/payments/queries", () => ({ listAgingForParty: mocks.listAgingForParty }));
vi.mock("@cofounderai/module-inventory/contract/index", () => ({ listRecentOrdersForParty: mocks.listRecentOrdersForParty }));
vi.mock("@cofounderai/module-fsm/contract/index", () => ({ listRecentJobsForParty: mocks.listRecentJobsForParty }));
vi.mock("../lib/customer-360/queries", () => ({ getCustomer360: mocks.getCustomer360 }));
vi.mock("../lib/opportunities/queries", () => ({ listStages: mocks.listStages }));
vi.mock("../lib/scoring/buying-intent", () => ({ getBuyingIntentScore: mocks.getBuyingIntentScore }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));
vi.mock("../lib/timeline/queries", () => ({ listRelationshipTimeline: mocks.listRelationshipTimeline }));

import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { crmCustomer360Export } from "./customer-360";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

const PARTY = { id: "p1", business_id: BUSINESS_ID, kind: "company", name: "Acme Pvt Ltd", email: "buy@acme.test", phone: null, is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getParty.mockResolvedValue(PARTY);
  mocks.listContactsForParty.mockResolvedValue([
    { id: "pc1", first_name: "Asha", last_name: "Rao", job_title: "Buyer", email: "asha@acme.test", phone: null, linkedin_url: "https://linkedin.example/asha", is_primary: true, status: "active" },
  ]);
  mocks.listAgingForParty.mockResolvedValue([
    { document_id: "d1", business_id: BUSINESS_ID, party_id: "p1", doc_type: "sales_invoice", number: "INV-1", due_date: "2026-09-01", days_overdue: 25, balance_amount: 1000, aging_bucket: "1-30" },
  ]);
  mocks.listRecentOrdersForParty.mockResolvedValue({ ok: true, data: [{ id: "so1", kind: "sales_order", number: "SO-1", status: "confirmed", totalAmount: 5000, orderDate: "2026-09-10" }] });
  mocks.listRecentJobsForParty.mockResolvedValue({ ok: false, error: "MODULE_NOT_LICENSED" });
  mocks.getCustomer360.mockResolvedValue({
    partyId: "p1",
    name: "Acme Pvt Ltd",
    contactMethods: { email: "buy@acme.test", phone: null },
    lifecycleStatus: "qualified",
    ownerId: "emp-1",
    source: "referral",
    productsOfInterest: [{ id: "pi1", itemId: "item-1", itemName: "Drill", quantity: 2 }],
    openLeads: [],
    openOpportunities: [{ id: "o1", status: "open", stageId: "s1", createdAt: "2026-09-02T00:00:00Z" }],
    openFollowUps: [],
    recentConversations: [],
    notes: [{ id: "n1", body: "INTERNAL NOTE", authorId: null, createdAt: "2026-09-02T00:00:00Z" }],
    prospect: null,
    recentOrders: [],
    recentJobs: [],
  });
  mocks.listStages.mockResolvedValue([{ id: "s1", name: "Proposal" }]);
  mocks.getBuyingIntentScore.mockResolvedValue({
    score: 64,
    calculatedAt: "2026-09-24T00:00:00Z",
    signals: [{ key: "k", label: "Discovery buying signals", points: 10, maxPoints: 20, evidence: "2 signals" }],
  });
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-1", full_name: "Kunal", email: null }]);
  mocks.listRelationshipTimeline.mockResolvedValue([
    { id: "t1", source: "crm.interaction", occurredAt: "2026-09-20T00:00:00Z", label: "Received whatsapp message", detail: "Hello", detailHref: null },
  ]);
});

describe("crm.customer-360 (EXP-CRM-10)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmCustomer360Export.id).toBe("crm.customer-360");
    expect(crmCustomer360Export.module).toBe("crm");
    expect(crmCustomer360Export.permissions).toEqual(["crm.view"]);
  });

  it("refuses a missing customer or another business's customer (tenant isolation)", async () => {
    await expect(crmCustomer360Export.load(exportContext(), crmCustomer360Export.parseFilters!(requestParams()))).rejects.toBeInstanceOf(ExportDeniedError);
    mocks.getParty.mockResolvedValue({ ...PARTY, business_id: "biz-other" });
    await expect(
      crmCustomer360Export.load(exportContext(), crmCustomer360Export.parseFilters!(requestParams({ partyId: "p1" }))),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.getCustomer360).not.toHaveBeenCalled();
  });

  it("reads everything for the resolved business and the verified party", async () => {
    await crmCustomer360Export.load(exportContext(), crmCustomer360Export.parseFilters!(requestParams({ partyId: "p1" })));
    expect(mocks.getCustomer360).toHaveBeenCalledWith(BUSINESS_ID, "p1");
    expect(mocks.listRecentOrdersForParty).toHaveBeenCalledWith(BUSINESS_ID, "p1");
    expect(mocks.listRecentJobsForParty).toHaveBeenCalledWith(BUSINESS_ID, "p1");
    expect(mocks.listAgingForParty).toHaveBeenCalledWith(BUSINESS_ID, "p1");
  });

  it("has one sheet per section", async () => {
    const workbook = await crmCustomer360Export.load(exportContext(), { partyId: "p1" });
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Customer",
      "Contacts",
      "Opportunities",
      "Follow-ups",
      "Products of Interest",
      "Recent Orders",
      "Recent Jobs",
      "Payment Aging",
      "Interactions",
      "Buying Intent Signals",
    ]);
  });

  it("labels an unlicensed module's data as unavailable, blank not zero", async () => {
    const workbook = await crmCustomer360Export.load(exportContext(), { partyId: "p1" });
    expect(rowsOf(workbook, "Customer")[0]).toMatchObject({
      Customer: "Acme Pvt Ltd",
      Type: "Company",
      "Lifecycle status": "Qualified",
      Source: "Referral",
      Owner: "Kunal",
      "Buying intent score": 64,
      "Buying intent source": "Rule-based score",
      "Outstanding balance": 1000,
      "Recent orders": 1,
      "Recent orders source": "Inventory",
      "Recent jobs": null,
      "Recent jobs source": "FSM unavailable (not licensed)",
    });
    expect(rowsOf(workbook, "Recent Jobs")).toEqual([]);
    expect(rowsOf(workbook, "Recent Orders")[0]).toMatchObject({ Document: "Sales order", Number: "SO-1", Status: "Confirmed", Total: 5000 });
    expect(rowsOf(workbook, "Opportunities")[0]).toMatchObject({ Stage: "Proposal", Status: "Open" });
    expect(rowsOf(workbook, "Payment Aging")[0]).toMatchObject({ "Document type": "Sales invoice", "Aging bucket": "1-30 days" });
    expect(rowsOf(workbook, "Interactions")[0]).toMatchObject({ Source: "CRM interaction" });
  });

  it("leaves an uncalculated score blank and excludes notes and profile URLs", async () => {
    mocks.getBuyingIntentScore.mockResolvedValue(null);
    const workbook = await crmCustomer360Export.load(exportContext(), { partyId: "p1" });
    expect(rowsOf(workbook, "Customer")[0]).toMatchObject({ "Buying intent score": null, "Buying intent source": "Not calculated yet" });
    const text = JSON.stringify(workbook.sheets.map((s) => rowsOf(workbook, s.sheetName)));
    expect(text).not.toContain("INTERNAL NOTE");
    expect(text).not.toContain("linkedin");
  });
});
