// EXP-FND-02 -- Funding profile export (/discovery/funding/profile).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { getFundingFinanceSnapshot } from "@cofounderai/module-gst/contract/index";
import { getBusiness } from "../../lib/tenancy/queries";
import { listOfferingOptions } from "../../lib/marketing/queries";
import { getFundingProfile } from "../../lib/funding/queries";
import { PROVENANCE_LABEL, type FundingProfile, type TractionEntry } from "../../lib/funding/types";
import { financeSource } from "./shared";

type FieldRow = { section: string; field: string; value: unknown; provenance: string; source: string };

const USER = "User-entered";

function narrative(p: FundingProfile | null): FieldRow[] {
  const row = (section: string, field: string, value: unknown): FieldRow => ({ section, field, value: value ?? null, provenance: USER, source: "Funding profile" });
  return [
    row("Company", "Geography", p?.company.geography),
    row("Company", "Founded", p?.company.founded),
    row("Company", "Summary", p?.company.summary),
    row("Company", "Team", p?.company.team),
    row("Product", "Customer problem", p?.product.problem),
    row("Product", "Differentiation", p?.product.differentiation),
    row("Product", "Evidence", p?.product.evidence),
    row("Market", "Target market", p?.market.targetMarket),
    row("Market", "Geography", p?.market.geography),
    row("Market", "Segmentation", p?.market.segmentation),
    row("Market", "Evidence and sources", p?.market.evidence),
    row("Business model", "Pricing", p?.businessModel.pricing),
    row("Business model", "Revenue model", p?.businessModel.revenueModel),
    row("Business model", "Contract model", p?.businessModel.contractModel),
    row("Business model", "Recurring vs one-time", p?.businessModel.recurring),
    row("Fundraising objective", "Target amount", p?.objective.targetAmount),
    row("Fundraising objective", "Currency", p?.objective.currency),
    row("Fundraising objective", "Preferred instrument", p?.objective.instrument),
    row("Fundraising objective", "Target close", p?.objective.targetClose),
    row("Fundraising objective", "Use of funds", p?.objective.useOfFunds),
  ];
}

/**
 * The funding profile field by field, each with its provenance next to it (§47): the
 * narrative the founder wrote (user-entered), the facts shown from the business record
 * and offerings (read from where they live, not copied), the Finance figures (Finance-
 * derived, through module-gst's contract, blank with the reason when Finance is not
 * available), and the traction figures with the source and provenance each carries.
 */
export const fundingProfileExport: ExportAdapter<Record<string, never>> = {
  id: "funding.profile",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [profile, business, offerings, finance] = await Promise.all([
      getFundingProfile(context.businessId),
      getBusiness(context.businessId),
      listOfferingOptions(context.businessId),
      getFundingFinanceSnapshot(context.businessId),
    ]);
    const { data: fin, source: financeLabel } = financeSource(finance);
    const financeRow = (field: string, value: number | null | undefined): FieldRow => ({
      section: "From Finance",
      field: fin ? `${field} (${fin.currency})` : field,
      value: fin ? (value ?? null) : null,
      provenance: "Finance-derived",
      source: financeLabel,
    });

    const rows: FieldRow[] = [
      ...narrative(profile),
      { section: "From your records", field: "Company", value: business?.name ?? null, provenance: USER, source: "Business record" },
      { section: "From your records", field: "Website", value: business?.website ?? null, provenance: USER, source: "Business record" },
      { section: "From your records", field: "Business offerings", value: offerings.map((o) => o.name), provenance: USER, source: "Business offerings" },
      financeRow("Revenue, last 3 months", fin?.revenueLast3Months),
      financeRow("Cash", fin?.cash),
      financeRow("Monthly burn", fin?.netBurn),
      { ...financeRow("Runway (months)", fin?.runwayMonths), field: "Runway (months)" },
    ];

    const fieldColumns: ExportColumn<FieldRow>[] = [
      { key: "section", header: "Section", getValue: (r) => r.section },
      { key: "field", header: "Field", getValue: (r) => r.field },
      { key: "value", header: "Value", getValue: (r) => r.value },
      { key: "provenance", header: "Provenance", getValue: (r) => r.provenance },
      { key: "source", header: "Source", getValue: (r) => r.source },
    ];
    const tractionColumns: ExportColumn<TractionEntry>[] = [
      { key: "metric", header: "Metric", getValue: (t) => t.metric },
      { key: "value", header: "Value", getValue: (t) => t.value },
      { key: "period", header: "Period", getValue: (t) => t.period },
      { key: "source", header: "Source", getValue: (t) => t.source },
      { key: "provenance", header: "Provenance", getValue: (t) => PROVENANCE_LABEL[t.provenance] ?? t.provenance },
    ];

    return {
      module: "discovery",
      resource: "funding-profile",
      title: "Funding profile",
      metadata: { "Profile last updated": profile?.updatedAt ?? "No profile yet" },
      sheets: [
        { sheetName: "Profile", columns: fieldColumns, rows },
        { sheetName: "Traction", columns: tractionColumns, rows: profile?.traction ?? [] },
      ],
    };
  },
};
