// EXP-FND-05 -- Investors list export (/discovery/funding/investors).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listPipeline, listRounds, pickActiveRound } from "../../lib/funding/queries";
import { researchState } from "../../lib/funding/metrics";
import {
  INVESTOR_SOURCE_LABEL,
  INVESTOR_TYPES,
  INVESTOR_TYPE_LABEL,
  PIPELINE_STAGE_LABEL,
  type Investor,
  type InvestorType,
  type PipelineStage,
} from "../../lib/funding/types";
import { listInvestorsForExport, primaryContactsForExport, type PrimaryContact } from "./queries";

type Filters = { status: "active" | "archived"; type: InvestorType | null };

export const RESEARCH_LABEL = { not_researched: "Not researched", researching: "Researching", researched: "Researched", stale: "Stale" } as const;

type Row = { investor: Investor; contact: PrimaryContact | undefined; stage: PipelineStage | undefined; research: keyof typeof RESEARCH_LABEL };

/**
 * The investor list as the page shows it -- active or archived, optionally one type,
 * sorted by name -- with each investor's stage in the live round (the page's "Stages
 * shown for <round>"), its research freshness and its primary contact.
 */
export const fundingInvestorsExport: ExportAdapter<Filters> = {
  id: "funding.investors",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => {
    const type = params.get("type");
    return {
      status: params.get("status") === "archived" ? "archived" : "active",
      type: (INVESTOR_TYPES as readonly string[]).includes(type ?? "") ? (type as InvestorType) : null,
    };
  },
  describeFilters: (f) => ({ Show: f.status === "archived" ? "Archived" : "Active", Type: f.type ? INVESTOR_TYPE_LABEL[f.type] : "" }),
  async load(context, filters) {
    const [investors, rounds] = await Promise.all([listInvestorsForExport(context.businessId, filters.status), listRounds(context.businessId)]);
    const round = pickActiveRound(rounds);
    const shown = filters.type ? investors.filter((i) => i.investorType === filters.type) : investors;
    const [pipeline, contacts] = await Promise.all([
      round ? listPipeline(context.businessId, { roundId: round.id }) : Promise.resolve([]),
      primaryContactsForExport(
        context.businessId,
        shown.map((i) => i.partyId),
      ),
    ]);
    const stageByInvestor = new Map(pipeline.map((p) => [p.investorId, p.stage]));
    const now = new Date();
    const rows: Row[] = shown.map((investor) => ({
      investor,
      contact: contacts.get(investor.partyId),
      stage: stageByInvestor.get(investor.id),
      research: researchState(investor, now),
    }));

    const columns: ExportColumn<Row>[] = [
      { key: "investor", header: "Investor", getValue: (r) => r.investor.name },
      { key: "type", header: "Type", getValue: (r) => INVESTOR_TYPE_LABEL[r.investor.investorType] ?? r.investor.investorType },
      { key: "geography", header: "Geography", getValue: (r) => r.investor.geographies },
      { key: "stages", header: "Stage preference", getValue: (r) => r.investor.stages },
      { key: "sectors", header: "Sector preference", getValue: (r) => r.investor.sectors },
      { key: "checkMin", header: "Cheque min", type: "currency", getValue: (r) => r.investor.checkMin },
      { key: "checkMax", header: "Cheque max", type: "currency", getValue: (r) => r.investor.checkMax },
      { key: "currency", header: "Currency", getValue: (r) => r.investor.currency },
      { key: "source", header: "Source", getValue: (r) => INVESTOR_SOURCE_LABEL[r.investor.source] ?? r.investor.source },
      { key: "sourceNote", header: "Source note", getValue: (r) => r.investor.sourceNote },
      { key: "status", header: "Status", getValue: (r) => (r.investor.status === "archived" ? "Archived" : "Active") },
      { key: "website", header: "Website", getValue: (r) => r.investor.website },
      { key: "email", header: "Email", getValue: (r) => r.investor.email },
      { key: "contact", header: "Primary contact", getValue: (r) => r.contact?.name ?? null },
      { key: "contactEmail", header: "Primary contact email", getValue: (r) => r.contact?.email ?? null },
      { key: "research", header: "Research", getValue: (r) => RESEARCH_LABEL[r.research] },
      { key: "researched", header: "Last researched", type: "datetime", getValue: (r) => r.investor.lastResearchedAt },
      { key: "round", header: "Active round", getValue: () => round?.name ?? null },
      { key: "stage", header: "Pipeline stage", getValue: (r) => (r.stage ? (PIPELINE_STAGE_LABEL[r.stage] ?? r.stage) : null) },
      { key: "created", header: "Added", type: "datetime", getValue: (r) => r.investor.createdAt },
    ];

    return {
      module: "discovery",
      resource: "funding-investors",
      title: "Investors",
      metadata: { "Stages shown for": round?.name ?? "No live round" },
      sheets: [{ sheetName: "Investors", columns, rows }],
    };
  },
};
