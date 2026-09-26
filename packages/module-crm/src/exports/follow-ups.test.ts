import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-07 -- Follow-up Queue export (current view + filters).

const mocks = vi.hoisted(() => ({ listFollowUpQueueForExport: vi.fn(), listEmployeeOptions: vi.fn() }));
vi.mock("./queries", () => ({ listFollowUpQueueForExport: mocks.listFollowUpQueueForExport }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));

import { crmFollowUpsExport, parseFollowUpFilters } from "./follow-ups";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

const DAY = 24 * 3_600_000;

function followUp(overrides: Record<string, unknown>) {
  return {
    id: "f",
    business_id: BUSINESS_ID,
    party_id: null,
    lead_id: null,
    opportunity_id: null,
    conversation_id: null,
    activity_id: null,
    review_item_id: null,
    product_interest_id: null,
    owner_id: null,
    due_at: new Date(Date.now() + 3 * DAY).toISOString(),
    status: "pending",
    priority: "normal",
    snoozed_until: null,
    completed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    partyName: null,
    source: null,
    channel: null,
    reviewSummary: null,
    productInterestSummary: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-1", full_name: "Kunal", email: null }]);
  mocks.listFollowUpQueueForExport.mockResolvedValue([
    followUp({ id: "f1", partyName: "Asha", source: "whatsapp", channel: "whatsapp", priority: "high", owner_id: "emp-1", due_at: new Date(Date.now() - 5 * DAY).toISOString() }),
    followUp({ id: "f2", reviewSummary: "★★☆☆☆ review from Ravi", source: null, channel: "google_business_profile" }),
    followUp({ id: "f3", partyName: "Meera", productInterestSummary: "Waitlist: Drill", source: "referral", priority: "high" }),
  ]);
});

describe("crm.follow-ups (EXP-CRM-07)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmFollowUpsExport.id).toBe("crm.follow-ups");
    expect(crmFollowUpsExport.module).toBe("crm");
    expect(crmFollowUpsExport.permissions).toEqual(["crm.view"]);
  });

  it("whitelists the page's own filters and ignores everything else", () => {
    expect(parseFollowUpFilters(requestParams())).toEqual({ view: "all", ownerId: "", source: "", channel: "", priority: "" });
    expect(parseFollowUpFilters(requestParams({ view: "bogus", priority: "urgent", status: "completed" }))).toEqual({
      view: "all",
      ownerId: "",
      source: "",
      channel: "",
      priority: "",
    });
    expect(parseFollowUpFilters(requestParams({ view: "overdue", ownerId: "emp-1", source: "whatsapp", channel: "whatsapp", priority: "high" }))).toEqual({
      view: "overdue",
      ownerId: "emp-1",
      source: "whatsapp",
      channel: "whatsapp",
      priority: "high",
    });
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmFollowUpsExport.load(exportContext(), parseFollowUpFilters(requestParams()));
    expect(mocks.listFollowUpQueueForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listEmployeeOptions).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("no filters: every pending follow-up, with labels", async () => {
    const workbook = await crmFollowUpsExport.load(exportContext(), parseFollowUpFilters(requestParams()));
    expect(headers(workbook, "Follow-ups")).toEqual(["Contact", "Context", "Source", "Channel", "Priority", "Due", "Overdue", "Owner", "Status", "Completed"]);
    const rows = rowsOf(workbook, "Follow-ups");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ Contact: "Asha", Source: "WhatsApp", Channel: "WhatsApp", Priority: "High", Overdue: true, Owner: "Kunal", Status: "Pending", Completed: null });
    expect(rows[1]).toMatchObject({ Contact: "★★☆☆☆ review from Ravi", Context: "", Source: "", Channel: "Google Business Profile", Owner: "Unassigned" });
    expect(rows[2]).toMatchObject({ Contact: "Meera", Context: "Waitlist: Drill", Source: "Referral" });
  });

  it("one filter (priority) and several filters (view + owner) narrow like the page", async () => {
    const high = await crmFollowUpsExport.load(exportContext(), parseFollowUpFilters(requestParams({ priority: "high" })));
    expect(rowsOf(high, "Follow-ups").map((r) => r.Contact)).toEqual(["Asha", "Meera"]);

    const overdueMine = await crmFollowUpsExport.load(exportContext(), parseFollowUpFilters(requestParams({ view: "overdue", ownerId: "emp-1" })));
    expect(rowsOf(overdueMine, "Follow-ups").map((r) => r.Contact)).toEqual(["Asha"]);
  });

  it("an empty result is headers only", async () => {
    const workbook = await crmFollowUpsExport.load(exportContext(), parseFollowUpFilters(requestParams({ source: "discovery" })));
    expect(rowsOf(workbook, "Follow-ups")).toEqual([]);
  });

  it("describes filters by label", () => {
    expect(crmFollowUpsExport.describeFilters!(parseFollowUpFilters(requestParams({ view: "due_today", channel: "sms", priority: "low" })))).toMatchObject({
      View: "Due today",
      Channel: "SMS",
      Priority: "Low",
    });
  });
});
