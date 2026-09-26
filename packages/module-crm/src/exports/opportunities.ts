// EXP-CRM-03 -- CRM opportunities export (/crm/opportunities): the List view's rows and
// the Kanban board's per-stage totals, in one workbook.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { ASSESSMENT_REQUIREMENT_LABEL } from "../lib/opportunities/assessment";
import { FULFILLMENT_REQUIREMENT_LABEL } from "../lib/opportunities/fulfillment";
import { listStages } from "../lib/opportunities/queries";
import type { Opportunity } from "../lib/opportunities/types";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { SOURCE_CHANNEL_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";
import { listOpportunitiesForExport, listPartiesForExport } from "./queries";
import { pipelineRows, pipelineSheet } from "./sheets";

/**
 * The page has no filters -- `?view=list|kanban` only switches the layout, and both
 * layouts show the same opportunities -- so this export takes none. Stages are read
 * with `listStages()`, never the page's `ensureDefaultStages()`, which can write.
 */
export const crmOpportunitiesExport: ExportAdapter<Record<string, never>> = {
  id: "crm.opportunities",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [stages, opportunities, employees] = await Promise.all([
      listStages(context.businessId),
      listOpportunitiesForExport(context.businessId),
      listEmployeeOptions(context.businessId),
    ]);
    const parties = await listPartiesForExport(
      context.businessId,
      opportunities.map((o) => o.party_id),
    );
    const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
    const employeeById = employeeMap(employees);

    return {
      module: "crm",
      resource: "opportunities",
      title: "CRM opportunities",
      sheets: [
        {
          sheetName: "Opportunities",
          columns: [
            { key: "contact", header: "Contact / customer", getValue: (o: Opportunity) => parties.get(o.party_id)?.name ?? "Unknown contact" },
            {
              key: "stage",
              header: "Stage",
              getValue: (o: Opportunity) => (o.stage_id ? (stageNameById.get(o.stage_id) ?? "") : ""),
            },
            { key: "status", header: "Status", getValue: (o: Opportunity) => humanize(o.status) },
            { key: "value", header: "Estimated value", type: "currency", getValue: (o: Opportunity) => o.estimated_value },
            { key: "currency", header: "Currency", getValue: (o: Opportunity) => o.currency },
            {
              key: "probability",
              header: "Probability",
              type: "percent",
              getValue: (o: Opportunity) => (o.probability === null ? null : o.probability / 100),
            },
            { key: "close_date", header: "Expected close date", type: "date", getValue: (o: Opportunity) => o.expected_close_date },
            { key: "owner", header: "Owner", getValue: (o: Opportunity) => ownerName(employeeById, o.owner_id) },
            { key: "source", header: "Source", getValue: (o: Opportunity) => labelOf(SOURCE_CHANNEL_LABEL, o.source) },
            {
              key: "fulfillment",
              header: "Fulfillment requirement",
              getValue: (o: Opportunity) => (o.fulfillment_requirement ? FULFILLMENT_REQUIREMENT_LABEL[o.fulfillment_requirement] : ""),
            },
            {
              key: "assessment",
              header: "Assessment requirement",
              getValue: (o: Opportunity) => (o.assessment_requirement ? ASSESSMENT_REQUIREMENT_LABEL[o.assessment_requirement] : ""),
            },
            { key: "created", header: "Created", type: "datetime", getValue: (o: Opportunity) => o.created_at },
          ],
          rows: opportunities,
        },
        pipelineSheet("Pipeline by Stage", pipelineRows(stages, opportunities)),
      ],
    };
  },
};
