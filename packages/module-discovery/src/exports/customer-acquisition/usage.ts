// EXP-DISC-12 -- Discovery Usage export (/[businessSlug]/discovery/offerings/[productId]/usage).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { creditsUsedPercent, OPERATION_LABEL } from "../../lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "../../lib/usage/limits";
import { getWorkspaceUsage } from "../../lib/usage/queries";
import type { WorkspaceUsage } from "../../lib/usage/types";
import { labelOf, readProductId, resolveOffering } from "./shared";

type OperationRow = WorkspaceUsage["byOperation"][number];

/**
 * This month's AI usage for the offering, as the Usage page shows it: runs against the
 * monthly run limit and the share of the monthly AI credit allowance used -- a share,
 * never a raw currency figure, the same framing the page uses -- overall and per
 * operation. Same query as the page (`getWorkspaceUsage`).
 */
export const discoveryUsageExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.usage",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const usage = await getWorkspaceUsage(workspace.id);
    const creditsUsed = creditsUsedPercent(usage.totalCost) / 100;

    return {
      module: "discovery",
      resource: "usage",
      title: "Discovery AI usage",
      csvSheet: "By operation",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Summary",
          columns: [
            { key: "period_start", header: "Period start", type: "datetime", getValue: (u: WorkspaceUsage) => u.periodStart },
            { key: "period_end", header: "Period end", type: "datetime", getValue: (u: WorkspaceUsage) => u.periodEnd },
            { key: "runs", header: "AI runs", type: "integer", getValue: (u: WorkspaceUsage) => u.totalRuns },
            { key: "run_limit", header: "Monthly run limit", type: "integer", getValue: () => FREE_TIER_MONTHLY_RUN_LIMIT },
            { key: "credits", header: "AI credits used", type: "percent", getValue: () => creditsUsed },
            {
              key: "limit_reached",
              header: "Limit reached",
              type: "boolean",
              getValue: (u: WorkspaceUsage) => creditsUsed >= 1 || u.totalRuns >= FREE_TIER_MONTHLY_RUN_LIMIT,
            },
          ],
          rows: [usage],
        },
        {
          sheetName: "By operation",
          columns: [
            { key: "operation", header: "Operation", getValue: (o: OperationRow) => labelOf(OPERATION_LABEL, o.operation) },
            { key: "runs", header: "Runs", type: "integer", getValue: (o: OperationRow) => o.runs },
            { key: "credits", header: "Share of monthly AI credits", type: "percent", getValue: (o: OperationRow) => o.cost / FREE_TIER_MONTHLY_COST_LIMIT_USD },
            { key: "period_start", header: "Period start", type: "datetime", getValue: () => usage.periodStart },
            { key: "period_end", header: "Period end", type: "datetime", getValue: () => usage.periodEnd },
          ],
          rows: usage.byOperation,
        },
      ],
    };
  },
};
