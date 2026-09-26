// EXP-DISC-05 -- Opportunity export, and EXP-DISC-09 -- Opportunity / Pipeline export
// (/[businessSlug]/discovery/offerings/[productId]/opportunities). Discovery has one
// opportunities page, whose five dashboard bins are its pipeline stages, so both stories'
// fields are one export.
import { getDiscoveryHandoffLead } from "@cofounderai/module-crm/contract/index";
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { DASHBOARD_BIN_LABEL, DASHBOARD_BIN_ORDER } from "../../lib/opportunities/dashboard";
import { getOpportunityDashboardRows, type OpportunityDashboardRow } from "../../lib/opportunities/dashboard-queries";
import { computeHandoffStatus, HANDOFF_STATUS_LABEL } from "../../lib/opportunities/handoff";
import { effectiveRecommendedAction } from "../../lib/opportunities/next-best-action";
import { SCORE_COMPONENT_LABEL } from "../../lib/opportunities/scoring";
import { NEXT_BEST_ACTION_LABEL, OPPORTUNITY_STATUS_LABEL, type Opportunity } from "../../lib/opportunities/types";
import { BASIS, LEVEL_LABEL, ageInDays, labelOf, readProductId, resolveOffering } from "./shared";

type Row = OpportunityDashboardRow & { crmLead: boolean | null; crmSource: string | null };

const COMPONENTS: { key: keyof typeof SCORE_COMPONENT_LABEL; column: keyof Opportunity }[] = [
  { key: "icpFit", column: "icp_fit_score" },
  { key: "buyerFit", column: "buyer_fit_score" },
  { key: "needFit", column: "need_fit_score" },
  { key: "timing", column: "timing_score" },
  { key: "signalStrength", column: "signal_strength_score" },
  { key: "contactability", column: "contactability_score" },
  { key: "evidenceConfidence", column: "evidence_confidence_score" },
];

/**
 * The page's active opportunities (its own `getOpportunityDashboardRows`, unpaginated),
 * in the page's bin order. "Stage" is the dashboard bin the page groups rows under;
 * "Status" is the lifecycle a founder sets. The recommended action is the one in effect
 * (a founder's override wins), with its source alongside. CRM handoff is computed the way
 * the product computes it, asking CRM only through its contract -- when CRM isn't
 * licensed the "already in CRM" check can't run, so a would-be "Not Sent" stays blank and
 * the source column says why.
 * Opportunities carry no estimated value and the page shows no research date, so neither
 * is exported; "Last evaluated" is when the opportunity was last re-scored.
 */
export const discoveryOpportunitiesExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.opportunities",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const dashboardRows = await getOpportunityDashboardRows(workspace.id);
    const ordered = DASHBOARD_BIN_ORDER.flatMap((bin) => dashboardRows.filter((row) => row.bin === bin));

    const prospectIds = [...new Set(ordered.map((row) => row.prospect.id))];
    const leads = new Map(
      await Promise.all(
        prospectIds.map(async (id) => [id, await getDiscoveryHandoffLead(context.businessId, id)] as const),
      ),
    );
    const rows: Row[] = ordered.map((row) => {
      const lead = leads.get(row.prospect.id);
      if (lead?.ok) return { ...row, crmLead: lead.data !== null, crmSource: null };
      return {
        ...row,
        crmLead: null,
        crmSource: lead?.error === "MODULE_NOT_LICENSED" ? "CRM not licensed -- existing CRM leads not checked" : "CRM unavailable -- existing CRM leads not checked",
      };
    });
    const now = new Date();

    return {
      module: "discovery",
      resource: "opportunities",
      title: "Discovery opportunities",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Opportunities",
          columns: [
            { key: "stage", header: "Stage", getValue: (r: Row) => DASHBOARD_BIN_LABEL[r.bin] },
            { key: "prospect", header: "Prospect", getValue: (r: Row) => r.prospect.company_name },
            { key: "contact", header: "Contact", getValue: (r: Row) => r.contactName },
            { key: "status", header: "Status", getValue: (r: Row) => labelOf(OPPORTUNITY_STATUS_LABEL, r.opportunity.status) },
            { key: "priority", header: "Priority", getValue: (r: Row) => labelOf(LEVEL_LABEL, r.opportunity.priority) },
            { key: "score", header: "Opportunity score", type: "integer", getValue: (r: Row) => r.opportunity.score },
            { key: "score_basis", header: "Score basis", getValue: (r: Row) => (r.opportunity.score === null ? null : BASIS.calculated) },
            { key: "score_reason", header: "Score reason", getValue: (r: Row) => r.opportunity.score_reason },
            { key: "confidence", header: "Confidence", getValue: (r: Row) => labelOf(LEVEL_LABEL, r.opportunity.confidence) },
            { key: "offering_fit", header: "Offering fit", getValue: (r: Row) => r.opportunity.why_them },
            { key: "why_now", header: "Why now", getValue: (r: Row) => r.opportunity.why_now },
            { key: "why_now_confidence", header: "Why now confidence", getValue: (r: Row) => labelOf(LEVEL_LABEL, r.opportunity.why_now_confidence) },
            { key: "signal", header: "Top signal", getValue: (r: Row) => r.topSignal },
            { key: "evidence", header: "Evidence items", type: "integer", getValue: (r: Row) => r.opportunity.evidence_count },
            {
              key: "recommended_action",
              header: "Recommended action",
              getValue: (r: Row) => labelOf(NEXT_BEST_ACTION_LABEL, effectiveRecommendedAction(r.opportunity)),
            },
            {
              key: "recommendation_source",
              header: "Recommendation source",
              getValue: (r: Row) =>
                r.opportunity.recommended_action_override !== null
                  ? "Founder override"
                  : r.opportunity.recommended_action !== null
                    ? "System recommendation"
                    : null,
            },
            {
              key: "recommendation_reason",
              header: "Recommendation reason",
              getValue: (r: Row) => (r.opportunity.recommended_action_override !== null ? null : r.opportunity.recommended_action_reason),
            },
            {
              key: "crm_handoff",
              header: "CRM handoff",
              getValue: (r: Row) => {
                const status = computeHandoffStatus({
                  opportunityStatus: r.opportunity.status,
                  handoffFailedAt: r.opportunity.handoff_failed_at,
                  hasExistingCrmLead: r.crmLead ?? false,
                });
                // "Not sent" is only knowable once CRM has been asked; without it, blank.
                return status === "not_sent" && r.crmLead === null ? null : HANDOFF_STATUS_LABEL[status];
              },
            },
            { key: "crm_source", header: "CRM handoff source", getValue: (r: Row) => r.crmSource },
            { key: "age", header: "Age (days)", type: "integer", getValue: (r: Row) => ageInDays(r.opportunity.created_at, now) },
            { key: "created", header: "Created", type: "datetime", getValue: (r: Row) => r.opportunity.created_at },
            { key: "evaluated", header: "Last evaluated", type: "datetime", getValue: (r: Row) => r.opportunity.last_evaluated_at },
            ...COMPONENTS.map(({ key, column }) => ({
              key: `component_${key}`,
              header: SCORE_COMPONENT_LABEL[key],
              type: "integer" as const,
              getValue: (r: Row) => r.opportunity[column],
            })),
          ],
          rows,
        },
      ],
    };
  },
};
