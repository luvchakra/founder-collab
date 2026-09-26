// EXP-CRM-06 -- Reactivation export (/crm/reactivation).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listReactivationOpportunities } from "../lib/reactivation/queries";
import { REACTIVATION_REASON_LABEL, type ReactivationOpportunity } from "../lib/reactivation/types";

/**
 * Exactly the page's list: one row per detected signal, computed live by the page's own
 * `listReactivationOpportunities()` (each signal is already capped by that function, so
 * there is no larger "all" set). The detail text carries the signal's evidence (e.g.
 * the last-activity date); the suggestion is rule-based, and says so (§44). The page
 * records no owner or status for a signal, so neither does the export.
 */
export const crmReactivationExport: ExportAdapter<Record<string, never>> = {
  id: "crm.reactivation",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const opportunities = await listReactivationOpportunities(context.businessId);
    return {
      module: "crm",
      resource: "reactivation",
      title: "CRM reactivation opportunities",
      sheets: [
        {
          sheetName: "Reactivation",
          columns: [
            { key: "customer", header: "Customer", getValue: (o: ReactivationOpportunity) => o.partyName },
            { key: "reason", header: "Reactivation reason", getValue: (o: ReactivationOpportunity) => REACTIVATION_REASON_LABEL[o.reason] ?? o.reason },
            { key: "detail", header: "Signal detail", getValue: (o: ReactivationOpportunity) => o.detail },
            { key: "action", header: "Recommended action", getValue: (o: ReactivationOpportunity) => o.suggestedAction },
            { key: "action_source", header: "Recommendation source", getValue: () => "Rule-based signal" },
          ],
          rows: opportunities,
        },
      ],
    };
  },
};
