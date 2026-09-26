// EXP-FSM-04 -- Service opportunities export: every opportunity on
// /[businessSlug]/service/opportunities.
//
// The story's "owner" and "expected close" fields are not exported: FSM opportunities
// have neither (no such columns on fsm.opportunities, and no page shows one). The value
// is the opportunity's estimate total -- the only money an FSM opportunity carries --
// with the estimate number beside it, and blank when no estimate was written.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { OPPORTUNITY_SOURCE_LABEL, OPPORTUNITY_STATUS_LABEL, labelFor } from "./labels";
import { listOpportunitiesForExport, type OpportunityExportRow } from "./queries";

export const fsmOpportunitiesExport: ExportAdapter<Record<string, never>> = {
  id: "fsm.opportunities",
  module: "fsm",
  // The opportunities page checks no permission of its own -- the fsm licence (checked
  // by the runner) and business membership (RLS) are what reading it takes.
  permissions: [],
  // The page has no filters (its board/table toggle is a view, not a filter).
  parseFilters: () => ({}),
  async load(context) {
    const opportunities = await listOpportunitiesForExport(context.businessId);
    return {
      module: "fsm",
      resource: "opportunities",
      title: "Service opportunities",
      sheets: [
        {
          sheetName: "Opportunities",
          columns: [
            { key: "number", header: "Opportunity #", getValue: (o: OpportunityExportRow) => o.number },
            { key: "customer", header: "Customer", getValue: (o: OpportunityExportRow) => o.party_name },
            { key: "service", header: "Service type", getValue: (o: OpportunityExportRow) => o.service_type_name },
            { key: "status", header: "Status", getValue: (o: OpportunityExportRow) => labelFor(OPPORTUNITY_STATUS_LABEL, o.status) },
            { key: "value", header: "Estimate value", type: "currency", currency: "INR", getValue: (o: OpportunityExportRow) => o.estimate_total },
            { key: "estimate", header: "Estimate #", getValue: (o: OpportunityExportRow) => o.estimate_number },
            { key: "source", header: "Source", getValue: (o: OpportunityExportRow) => labelFor(OPPORTUNITY_SOURCE_LABEL, o.source) },
            { key: "lost_reason", header: "Lost reason", getValue: (o: OpportunityExportRow) => o.lost_reason },
            { key: "description", header: "Description", getValue: (o: OpportunityExportRow) => o.description },
            { key: "created", header: "Created", type: "datetime", getValue: (o: OpportunityExportRow) => o.created_at },
          ],
          rows: opportunities,
        },
      ],
    };
  },
};
