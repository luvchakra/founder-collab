import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-02 -- CRM leads export.

const mocks = vi.hoisted(() => ({
  listLeadsForExport: vi.fn(),
  listPartiesForExport: vi.fn(),
  listEmployeeOptions: vi.fn(),
}));
vi.mock("./queries", () => ({ listLeadsForExport: mocks.listLeadsForExport, listPartiesForExport: mocks.listPartiesForExport }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));

import { renderExport } from "@cofounderai/core/exports/render";
import { crmLeadsExport } from "./leads";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

const LEADS = [
  {
    id: "lead-1",
    business_id: BUSINESS_ID,
    party_id: "party-1",
    status: "qualified",
    source: "existing_customer",
    source_module: null,
    source_reference: "secret-ref",
    owner_id: "emp-1",
    next_action_id: null,
    created_at: "2026-09-20T05:00:00Z",
    updated_at: "2026-09-21T05:00:00Z",
  },
  {
    id: "lead-2",
    business_id: BUSINESS_ID,
    party_id: "party-2",
    status: "new",
    source: "whatsapp",
    source_module: null,
    source_reference: null,
    owner_id: null,
    next_action_id: null,
    created_at: "2026-09-22T05:00:00Z",
    updated_at: "2026-09-22T05:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listLeadsForExport.mockResolvedValue(LEADS);
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-1", full_name: "Kunal", email: "kunal@example.com" }]);
  mocks.listPartiesForExport.mockResolvedValue(
    new Map([
      ["party-1", { id: "party-1", name: "Acme Pvt Ltd", kind: "company", email: "buy@acme.test", phone: "+91 98" }],
      ["party-2", { id: "party-2", name: "Asha", kind: "person", email: null, phone: null }],
    ]),
  );
});

describe("crm.leads (EXP-CRM-02)", () => {
  it("is licensed and permissioned like the Leads page", () => {
    expect(crmLeadsExport.id).toBe("crm.leads");
    expect(crmLeadsExport.module).toBe("crm");
    expect(crmLeadsExport.permissions).toEqual(["crm.view"]);
  });

  it("reads the resolved business only, whatever the request claims (tenant isolation)", async () => {
    const filters = crmLeadsExport.parseFilters!(requestParams({ status: "won", owner: "emp-9" }));
    expect(filters).toEqual({}); // the page has no filters, so unknown params are ignored
    await crmLeadsExport.load(exportContext(), filters);
    expect(mocks.listLeadsForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listEmployeeOptions).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listPartiesForExport).toHaveBeenCalledWith(BUSINESS_ID, ["party-1", "party-2"]);
  });

  it("writes labels, not codes, and keeps blanks blank", async () => {
    const workbook = await crmLeadsExport.load(exportContext(), {});
    expect(headers(workbook, "Leads")).toEqual(["Contact", "Company", "Email", "Phone", "Source", "Status", "Owner", "Created", "Last updated"]);
    const [first, second] = rowsOf(workbook, "Leads");
    expect(first).toMatchObject({
      Contact: "Acme Pvt Ltd",
      Company: "Acme Pvt Ltd",
      Email: "buy@acme.test",
      Source: "Existing customer",
      Status: "Qualified",
      Owner: "Kunal",
    });
    expect(second).toMatchObject({ Contact: "Asha", Company: "", Email: "", Phone: "", Source: "WhatsApp", Status: "New", Owner: "Unassigned" });
  });

  it("never carries internal references", async () => {
    const workbook = await crmLeadsExport.load(exportContext(), {});
    expect(serialized(workbook)).not.toContain("secret-ref");
    expect(serialized(workbook)).not.toContain(BUSINESS_ID);
  });

  it("renders a valid file with only headers when there are no leads", async () => {
    mocks.listLeadsForExport.mockResolvedValue([]);
    const workbook = await crmLeadsExport.load(exportContext(), {});
    const file = await renderExport(workbook, "csv", { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T00:00:00Z") });
    expect(file.rowCount).toBe(0);
    expect(file.filename).toBe("wonderark_crm_leads_2026-09-26.csv");
    expect(new TextDecoder().decode(file.body)).toContain("Contact,Company,Email,Phone,Source,Status,Owner,Created,Last updated");
  });
});
