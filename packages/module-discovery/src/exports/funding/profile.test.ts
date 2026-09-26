// EXP-FND-02 -- Funding profile export: every field with its provenance; Finance-derived
// values only through the contract, blank with a reason when unavailable.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundingProfile } from "../../lib/funding/types";

const h = vi.hoisted(() => ({
  getFundingProfile: vi.fn(),
  getBusiness: vi.fn(),
  listOfferingOptions: vi.fn(),
  getFundingFinanceSnapshot: vi.fn(),
}));
vi.mock("../../lib/funding/queries", () => ({ getFundingProfile: h.getFundingProfile }));
vi.mock("../../lib/tenancy/queries", () => ({ getBusiness: h.getBusiness }));
vi.mock("../../lib/marketing/queries", () => ({ listOfferingOptions: h.listOfferingOptions }));
vi.mock("@cofounderai/module-gst/contract/index", () => ({ getFundingFinanceSnapshot: h.getFundingFinanceSnapshot }));

import { fundingProfileExport } from "./profile";
import { BUSINESS_ID, exportContext, headers, params, rowValues, sheet } from "./test-support";

const PROFILE: FundingProfile = {
  id: "fp-1",
  company: { summary: "Payroll for SMEs", geography: "India" },
  product: { problem: "Late salaries" },
  market: {},
  traction: [
    { metric: "ARR", value: "₹1.2 Cr", period: "FY26", source: "Finance", provenance: "source_backed" },
    { metric: "Customers", value: "40", period: null, source: "CRM estimate", provenance: "ai_inferred" },
  ],
  businessModel: { revenueModel: "SaaS" },
  objective: { targetAmount: 10_000_000, currency: "INR", instrument: "Equity" },
  updatedAt: "2026-09-20T00:00:00Z",
};

type FieldRow = { section: string; field: string; value: unknown; provenance: string; source: string };
const field = (rows: FieldRow[], section: string, name: string) => rows.find((r) => r.section === section && r.field.startsWith(name));

beforeEach(() => {
  vi.clearAllMocks();
  h.getFundingProfile.mockResolvedValue(PROFILE);
  h.getBusiness.mockResolvedValue({ name: "Acme Ltd", website: "https://acme.example" });
  h.listOfferingOptions.mockResolvedValue([{ id: "o-1", name: "Payroll suite" }]);
  h.getFundingFinanceSnapshot.mockResolvedValue({ ok: true, data: { hasAccounts: false } });
});

describe("EXP-FND-02 funding.profile", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingProfileExport.id).toBe("funding.profile");
    expect(fundingProfileExport.module).toBe("discovery");
    expect(fundingProfileExport.permissions).toEqual(["funding.view"]);
  });

  it("reads the context's business only", async () => {
    expect(fundingProfileExport.parseFilters!(params())).toEqual({});
    await fundingProfileExport.load(exportContext(), {});
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("labels every value with its provenance", async () => {
    const wb = await fundingProfileExport.load(exportContext(), {});
    expect(headers(wb, "Profile")).toEqual(["Section", "Field", "Value", "Provenance", "Source"]);
    const rows = sheet(wb, "Profile").rows as FieldRow[];
    expect(field(rows, "Company", "Summary")).toMatchObject({ value: "Payroll for SMEs", provenance: "User-entered", source: "Funding profile" });
    expect(field(rows, "Fundraising objective", "Target amount")).toMatchObject({ value: 10_000_000, provenance: "User-entered" });
    expect(field(rows, "Market", "Target market")?.value).toBeNull();
    expect(field(rows, "From your records", "Company")).toMatchObject({ value: "Acme Ltd", source: "Business record" });
    expect(field(rows, "From Finance", "Cash")).toMatchObject({ value: null, provenance: "Finance-derived", source: "Finance unavailable: no accounts set up" });
    expect(headers(wb, "Traction")).toEqual(["Metric", "Value", "Period", "Source", "Provenance"]);
    expect(rowValues(wb, "Traction", 0)).toMatchObject({ Metric: "ARR", Provenance: "Source-backed" });
    expect(rowValues(wb, "Traction", 1)).toMatchObject({ Metric: "Customers", Provenance: "AI-inferred" });
  });

  it("exports Finance-derived values with the read time when Finance is available", async () => {
    h.getFundingFinanceSnapshot.mockResolvedValue({
      ok: true,
      data: { asOf: "2026-09-26T05:00:00Z", currency: "INR", cash: 900000, receivable: 0, payable: 0, revenueLast3Months: 300000, averageMonthlyNet: 1, netBurn: null, runwayMonths: null, hasAccounts: true },
    });
    const rows = sheet(await fundingProfileExport.load(exportContext(), {}), "Profile").rows as FieldRow[];
    expect(field(rows, "From Finance", "Cash")).toMatchObject({ field: "Cash (INR)", value: 900000, source: "Finance ledger, read 2026-09-26T05:00:00Z" });
    expect(field(rows, "From Finance", "Monthly burn")?.value).toBeNull();
  });

  it("is a valid workbook before any profile exists", async () => {
    h.getFundingProfile.mockResolvedValue(null);
    const wb = await fundingProfileExport.load(exportContext(), {});
    expect(sheet(wb, "Traction").rows).toHaveLength(0);
    expect((sheet(wb, "Profile").rows as FieldRow[]).filter((r) => r.source === "Funding profile").every((r) => r.value === null)).toBe(true);
  });
});
