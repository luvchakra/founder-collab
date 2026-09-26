// EXP-DISC-10 -- Conversion export (/[businessSlug]/discovery/offerings/[productId]/conversions).
import { getHandoffStatusForProspect } from "@cofounderai/module-fsm/contract/index";
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { computeConversionFunnel, PROSPECT_STAGE_LABEL, type ConversionFunnelStep } from "../../lib/prospects/pipeline";
import { listProspectsForExport, type ProspectExportRow } from "./queries";
import { PROSPECT_OUTCOME_LABEL, PROSPECT_STATUS_LABEL, humanize, labelOf, ratio, readProductId, resolveOffering } from "./shared";

// The Conversions page's own wording (conversions/create-opportunity-button.tsx).
const FSM_OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  estimate_scheduled: "Estimate scheduled",
  estimate_sent: "Estimate sent",
  won: "Won",
  lost: "Lost",
};

type FunnelRow = ConversionFunnelStep & { previous: number; total: number };
type OutcomeRow = { outcome: string; count: number; total: number };
type HandoffRow = {
  prospect: ProspectExportRow;
  created: boolean | null;
  opportunityStatus: string | null;
  job: string | null;
  invoice: string | null;
  source: string | null;
};

/**
 * The Conversions page's numbers: the funnel's per-stage counts (exactly what its bar
 * chart and KPI cards are drawn from), every prospect it counts, the outcome split, and
 * the Service handoff of each won customer -- asked of Service (FSM) only through its
 * contract, one call per won customer as the page does. Without a Service licence the
 * handoff cells are blank and the source column says so. Prospects come from the
 * uncapped export copy of the page's own query.
 */
export const discoveryConversionsExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.conversions",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const prospects = await listProspectsForExport([workspace.id]);
    const funnel = computeConversionFunnel(prospects);
    const customers = prospects.filter((p) => p.outcome === "won");

    const handoffs: HandoffRow[] = await Promise.all(
      customers.map(async (prospect): Promise<HandoffRow> => {
        const status = await getHandoffStatusForProspect(context.businessId, prospect.id);
        if (status.ok) {
          return {
            prospect,
            created: true,
            opportunityStatus: labelOf(FSM_OPPORTUNITY_STATUS_LABEL, status.data.opportunityStatus),
            job: humanize(status.data.jobStatus),
            invoice: status.data.invoiceNumber,
            source: null,
          };
        }
        if (status.error === "NOT_FOUND") {
          return { prospect, created: false, opportunityStatus: null, job: null, invoice: null, source: null };
        }
        return {
          prospect,
          created: null,
          opportunityStatus: null,
          job: null,
          invoice: null,
          source: status.error === "MODULE_NOT_LICENSED" ? "Service not licensed" : "Service unavailable",
        };
      }),
    );

    const funnelRows: FunnelRow[] = funnel.steps.map((step, i) => ({
      ...step,
      previous: i > 0 ? funnel.steps[i - 1]!.reached : funnel.total,
      total: funnel.total,
    }));
    const outcomeRows: OutcomeRow[] = (["open", "won", "lost"] as const).map((outcome) => ({
      outcome,
      count: prospects.filter((p) => p.outcome === outcome).length,
      total: prospects.length,
    }));

    return {
      module: "discovery",
      resource: "conversions",
      title: "Discovery conversions",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Funnel",
          columns: [
            { key: "stage", header: "Stage", getValue: (r: FunnelRow) => r.label },
            { key: "reached", header: "Prospects reached", type: "integer", getValue: (r: FunnelRow) => r.reached },
            { key: "share", header: "Share of all prospects", type: "percent", getValue: (r: FunnelRow) => ratio(r.reached, r.total) },
            { key: "step", header: "Conversion from previous stage", type: "percent", getValue: (r: FunnelRow) => ratio(r.reached, r.previous) },
          ],
          rows: funnelRows,
        },
        {
          sheetName: "Prospects",
          columns: [
            { key: "company", header: "Company", getValue: (p: ProspectExportRow) => p.company_name },
            { key: "stage", header: "Furthest stage reached", getValue: (p: ProspectExportRow) => PROSPECT_STAGE_LABEL[p.stage] },
            { key: "status", header: "Status", getValue: (p: ProspectExportRow) => labelOf(PROSPECT_STATUS_LABEL, p.status) },
            { key: "outcome", header: "Outcome", getValue: (p: ProspectExportRow) => labelOf(PROSPECT_OUTCOME_LABEL, p.outcome) },
            { key: "created", header: "Created", type: "datetime", getValue: (p: ProspectExportRow) => p.created_at },
            { key: "last_activity", header: "Last activity", type: "datetime", getValue: (p: ProspectExportRow) => p.lastActivityAt },
          ],
          rows: prospects,
        },
        {
          sheetName: "Outcomes",
          columns: [
            { key: "outcome", header: "Outcome", getValue: (r: OutcomeRow) => PROSPECT_OUTCOME_LABEL[r.outcome] },
            { key: "count", header: "Prospects", type: "integer", getValue: (r: OutcomeRow) => r.count },
            { key: "share", header: "Share of all prospects", type: "percent", getValue: (r: OutcomeRow) => ratio(r.count, r.total) },
          ],
          rows: outcomeRows,
        },
        {
          sheetName: "Handoffs",
          columns: [
            { key: "company", header: "Customer", getValue: (r: HandoffRow) => r.prospect.company_name },
            { key: "closed", header: "Closed", type: "datetime", getValue: (r: HandoffRow) => r.prospect.lastActivityAt },
            { key: "created", header: "Service opportunity created", type: "boolean", getValue: (r: HandoffRow) => r.created },
            { key: "status", header: "Service opportunity status", getValue: (r: HandoffRow) => r.opportunityStatus },
            { key: "job", header: "Job status", getValue: (r: HandoffRow) => r.job },
            { key: "invoice", header: "Invoice", getValue: (r: HandoffRow) => r.invoice },
            { key: "source", header: "Handoff source", getValue: (r: HandoffRow) => r.source },
          ],
          rows: handoffs,
        },
      ],
    };
  },
};
