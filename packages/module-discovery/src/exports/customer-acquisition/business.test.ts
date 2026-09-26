// EXP-DISC-01 -- Business / Business Offerings export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_ID, OTHER_BUSINESS_ID, PRODUCT_ID, WORKSPACE_ID, headersOf, makeBusiness, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames } from "./test-support";

const h = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  listProducts: vi.fn(),
  listWorkspacesForProducts: vi.fn(),
  getProspectCountsForExport: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  listProducts: h.listProducts,
  listWorkspacesForProducts: h.listWorkspacesForProducts,
}));
vi.mock("./queries", () => ({ getProspectCountsForExport: h.getProspectCountsForExport }));

const { discoveryBusinessExport: adapter } = await import("./business");

const SECOND_PRODUCT = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusiness.mockResolvedValue(makeBusiness());
  h.listProducts.mockResolvedValue([
    makeProduct(),
    makeProduct({ id: SECOND_PRODUCT, name: "Install Service", status: "archived", offering_type: null, website: null, category: null }),
  ]);
  // The second offering has no workspace yet.
  h.listWorkspacesForProducts.mockResolvedValue([makeWorkspace()]);
  h.getProspectCountsForExport.mockResolvedValue({ [WORKSPACE_ID]: { total: 1200, new: 700, qualified: 450, disqualified: 50 } });
});

describe("discovery.business (EXP-DISC-01)", () => {
  it("is business-level data: no module licence, the page's own (empty) permissions", () => {
    expect(adapter.id).toBe("discovery.business");
    expect(adapter.module).toBeNull();
    expect(adapter.permissions).toEqual([]);
  });

  it("reads only context.businessId, whatever the request carries", async () => {
    const filters = adapter.parseFilters!(new URLSearchParams({ businessId: OTHER_BUSINESS_ID, workspaceId: "ws-x" }));
    expect(filters).toEqual({});
    await adapter.load(makeContext(), filters);
    expect(h.getBusiness).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listProducts).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listWorkspacesForProducts).toHaveBeenCalledWith([PRODUCT_ID, SECOND_PRODUCT]);
    expect(h.getProspectCountsForExport).toHaveBeenCalledWith([WORKSPACE_ID]);
  });

  it("refuses when the business itself can't be read", async () => {
    h.getBusiness.mockResolvedValue(null);
    await expect(adapter.load(makeContext(), {})).rejects.toMatchObject({ status: 404 });
  });

  it("writes a Business sheet and an Offerings sheet (the CSV table)", async () => {
    const workbook = await adapter.load(makeContext(), {});
    expect(sheetNames(workbook)).toEqual(["Business", "Offerings"]);
    expect(workbook.csvSheet).toBe("Offerings");
    expect(headersOf(workbook, "Business")).toEqual(["Business", "Website", "Industry", "Description", "Offerings", "Created", "Updated"]);
    expect(headersOf(workbook, "Offerings")).toEqual([
      "Offering",
      "Type",
      "Status",
      "Category",
      "Description",
      "Offering URL",
      "Value proposition",
      "Primary problem",
      "Target market",
      "Prospects",
      "New prospects",
      "Qualified prospects",
      "Disqualified prospects",
      "Created",
      "Updated",
    ]);
    expect(rowsOf(workbook, "Business")[0]).toMatchObject({ Business: "Acme Ltd", Industry: "Manufacturing", Offerings: 2 });
  });

  it("labels enums and leaves unknown counts blank rather than zero", async () => {
    const workbook = await adapter.load(makeContext(), {});
    const [first, second] = rowsOf(workbook, "Offerings");
    expect(first).toMatchObject({ Offering: "Sensor Suite", Type: "Professional Service", Status: "Active", Prospects: 1200, "Qualified prospects": 450 });
    expect(second).toMatchObject({ Offering: "Install Service", Type: null, Status: "Archived", "Offering URL": null, Prospects: null });
  });

  it("never exports the logo URL or account id", async () => {
    h.getBusiness.mockResolvedValue(makeBusiness({ logo_url: "https://storage.example/logo.png?token=abc", account_id: "acct-secret" }));
    const workbook = await adapter.load(makeContext(), {});
    const text = JSON.stringify(workbook.sheets.map((s) => rowsOf(workbook, s.sheetName)));
    expect(text).not.toContain("token=abc");
    expect(text).not.toContain("acct-secret");
  });
});
