// EXP-DISC-01 -- Business / Business Offerings export (/[businessSlug]/business).
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import { OFFERING_STATUS_LABEL, OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { ProspectCounts } from "../../lib/prospects/queries";
import { getBusiness, listProducts, listWorkspacesForProducts } from "../../lib/tenancy/queries";
import type { Business, Product } from "../../lib/tenancy/types";
import { getProspectCountsForExport } from "./queries";
import { labelOf } from "./shared";

type OfferingExportRow = { offering: Product; counts: ProspectCounts | null };

/**
 * The Business page: the business's own profile plus its offerings table with each
 * offering's prospect count. Business-level data, so no module licence is checked
 * (`module: null`) -- but every read is still scoped by `context.businessId` and RLS.
 * Prospect counts come from an uncapped copy of the page's own count query. The business
 * has no stored location, so none is exported.
 */
export const discoveryBusinessExport: ExportAdapter<Record<string, never>> = {
  id: "discovery.business",
  module: null,
  permissions: [],
  parseFilters: () => ({}),
  async load(context) {
    const business = await getBusiness(context.businessId);
    if (!business) throw new ExportDeniedError("Business not found.", 404);

    const products = await listProducts(context.businessId);
    const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
    const workspaceByProductId = new Map(workspaces.map((w) => [w.product_id, w.id] as const));
    const counts = await getProspectCountsForExport(workspaces.map((w) => w.id));

    const rows: OfferingExportRow[] = products.map((offering) => {
      const workspaceId = workspaceByProductId.get(offering.id);
      return {
        offering,
        counts: workspaceId ? (counts[workspaceId] ?? { total: 0, new: 0, qualified: 0, disqualified: 0 }) : null,
      };
    });

    return {
      module: "discovery",
      resource: "business",
      title: "Business and offerings",
      csvSheet: "Offerings",
      sheets: [
        {
          sheetName: "Business",
          columns: [
            { key: "name", header: "Business", getValue: (b: Business) => b.name },
            { key: "website", header: "Website", getValue: (b: Business) => b.website },
            { key: "industry", header: "Industry", getValue: (b: Business) => b.industry },
            { key: "description", header: "Description", getValue: (b: Business) => b.description },
            { key: "offerings", header: "Offerings", type: "integer", getValue: () => products.length },
            { key: "created", header: "Created", type: "datetime", getValue: (b: Business) => b.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (b: Business) => b.updated_at },
          ],
          rows: [business],
        },
        {
          sheetName: "Offerings",
          columns: [
            { key: "offering", header: "Offering", getValue: (r: OfferingExportRow) => r.offering.name },
            { key: "type", header: "Type", getValue: (r: OfferingExportRow) => labelOf(OFFERING_TYPE_LABEL, r.offering.offering_type) },
            { key: "status", header: "Status", getValue: (r: OfferingExportRow) => labelOf(OFFERING_STATUS_LABEL, r.offering.status) },
            { key: "category", header: "Category", getValue: (r: OfferingExportRow) => r.offering.category },
            { key: "description", header: "Description", getValue: (r: OfferingExportRow) => r.offering.description },
            { key: "url", header: "Offering URL", getValue: (r: OfferingExportRow) => r.offering.website },
            { key: "value_proposition", header: "Value proposition", getValue: (r: OfferingExportRow) => r.offering.value_proposition },
            { key: "primary_problem", header: "Primary problem", getValue: (r: OfferingExportRow) => r.offering.primary_problem },
            { key: "target_market", header: "Target market", getValue: (r: OfferingExportRow) => r.offering.target_market },
            { key: "prospects", header: "Prospects", type: "integer", getValue: (r: OfferingExportRow) => r.counts?.total ?? null },
            { key: "prospects_new", header: "New prospects", type: "integer", getValue: (r: OfferingExportRow) => r.counts?.new ?? null },
            { key: "prospects_qualified", header: "Qualified prospects", type: "integer", getValue: (r: OfferingExportRow) => r.counts?.qualified ?? null },
            { key: "prospects_disqualified", header: "Disqualified prospects", type: "integer", getValue: (r: OfferingExportRow) => r.counts?.disqualified ?? null },
            { key: "created", header: "Created", type: "datetime", getValue: (r: OfferingExportRow) => r.offering.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (r: OfferingExportRow) => r.offering.updated_at },
          ],
          rows,
        },
      ],
    };
  },
};
