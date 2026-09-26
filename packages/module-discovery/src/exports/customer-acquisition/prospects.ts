// EXP-DISC-03 -- Offering Prospects export (/[businessSlug]/discovery/offerings/[productId]/prospects).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { PROSPECT_STAGE_LABEL, type ProspectStage } from "../../lib/prospects/pipeline";
import type { ProspectSort } from "../../lib/prospects/queries";
import type { ProspectStatus } from "../../lib/prospects/types";
import { listProspectsForExport, type ProspectExportRow } from "./queries";
import { BASIS, PROSPECT_OUTCOME_LABEL, PROSPECT_STATUS_LABEL, labelOf, readProductId, resolveOffering } from "./shared";

export type ProspectsExportFilters = {
  productId: string;
  status: string;
  industry: string;
  stage: string;
  sort: string;
  search: string;
};

const SORT_LABEL: Record<ProspectSort, string> = { recent: "Most recent", stage: "Stage", priority: "Priority" };

function sortMode(sort: string): ProspectSort {
  return sort === "stage" || sort === "priority" ? sort : "recent";
}

/**
 * Every prospect matching the page's own filters -- status, industry and stage go to the
 * query exactly as the page passes them; `search` is matched on company name the way the
 * page's own search box matches it (case-insensitive substring); `sort` orders the rows
 * as the page does. The page has no pagination, so the current view and all matching
 * records are the same rows -- read through an uncapped copy of the page's query.
 * Prospects carry no stored "source", so none is exported.
 */
export const discoveryProspectsExport: ExportAdapter<ProspectsExportFilters> = {
  id: "discovery.prospects",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({
    productId: readProductId(params),
    status: params.get("status") ?? "",
    industry: params.get("industry") ?? "",
    stage: params.get("stage") ?? "",
    sort: params.get("sort") ?? "",
    search: params.get("search") ?? "",
  }),
  describeFilters: (f) => ({
    Offering: f.productId,
    Status: f.status ? (PROSPECT_STATUS_LABEL[f.status] ?? f.status) : "",
    Industry: f.industry,
    Stage: f.stage ? (PROSPECT_STAGE_LABEL[f.stage as ProspectStage] ?? f.stage) : "",
    Search: f.search,
    Sort: f.sort ? SORT_LABEL[sortMode(f.sort)] : "",
  }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);

    const rows = await listProspectsForExport(
      [workspace.id],
      {
        status: (filters.status as ProspectStatus) || undefined,
        industry: filters.industry || undefined,
        stage: (filters.stage as ProspectStage) || undefined,
      },
      sortMode(filters.sort),
    );
    const q = filters.search.trim().toLowerCase();
    const prospects = q ? rows.filter((p) => p.company_name.toLowerCase().includes(q)) : rows;

    return {
      module: "discovery",
      resource: "prospects",
      title: "Discovery prospects",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Prospects",
          columns: [
            { key: "company", header: "Company", getValue: (p: ProspectExportRow) => p.company_name },
            { key: "website", header: "Website", getValue: (p: ProspectExportRow) => p.website },
            { key: "domain", header: "Domain", getValue: (p: ProspectExportRow) => p.domain },
            { key: "industry", header: "Industry", getValue: (p: ProspectExportRow) => p.industry },
            { key: "company_size", header: "Company size", getValue: (p: ProspectExportRow) => p.company_size },
            { key: "location", header: "Location", getValue: (p: ProspectExportRow) => p.location },
            { key: "status", header: "Status", getValue: (p: ProspectExportRow) => labelOf(PROSPECT_STATUS_LABEL, p.status) },
            { key: "stage", header: "Stage", getValue: (p: ProspectExportRow) => PROSPECT_STAGE_LABEL[p.stage] },
            { key: "next_action", header: "Next action", getValue: (p: ProspectExportRow) => p.nextAction },
            { key: "needs_next_step", header: "Needs next step", type: "boolean", getValue: (p: ProspectExportRow) => p.isStuck },
            { key: "score", header: "Fit score", type: "integer", getValue: (p: ProspectExportRow) => p.fit_score },
            { key: "score_basis", header: "Fit score basis", getValue: (p: ProspectExportRow) => (p.fit_score === null ? null : BASIS.fitScore) },
            { key: "outcome", header: "Outcome", getValue: (p: ProspectExportRow) => labelOf(PROSPECT_OUTCOME_LABEL, p.outcome) },
            { key: "created", header: "Created", type: "datetime", getValue: (p: ProspectExportRow) => p.created_at },
            { key: "researched", header: "Last researched", type: "datetime", getValue: (p: ProspectExportRow) => p.researchedAt },
            { key: "last_activity", header: "Last activity", type: "datetime", getValue: (p: ProspectExportRow) => p.lastActivityAt },
          ],
          rows: prospects,
        },
      ],
    };
  },
};
