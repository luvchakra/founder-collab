// EXP-FND-10 -- Funding analytics export (/discovery/funding/analytics).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import {
  listDataRoomItems,
  listDiligence,
  listInteractions,
  listInvestors,
  listOutreach,
  listPipeline,
  listReadinessItems,
  listRounds,
  listShares,
  listStageHistory,
  pickActiveRound,
} from "../../lib/funding/queries";
import {
  dataRoomSummary,
  investorFunnel,
  readinessSummary,
  roundProgress,
  sourceBreakdown,
  stageEntriesByPeriod,
  timeInStage,
} from "../../lib/funding/metrics";
import {
  DILIGENCE_STATUSES,
  DILIGENCE_STATUS_LABEL,
  INVESTOR_SOURCE_LABEL,
  PIPELINE_STAGE_LABEL,
  type Interaction,
  type InvestorSource,
  type PipelineStage,
} from "../../lib/funding/types";
import { COUNT_COLUMNS, funnelColumns, funnelRows, idParam, roundColumns, type CountRow } from "./shared";

type Filters = { roundId?: string; grain: "week" | "month" };

const SERIES_STAGES = ["contacted", "meeting", "due_diligence", "term_discussion", "committed", "invested"] as const satisfies readonly PipelineStage[];

type SourceRow = { source: string; investors: number; inPipeline: number; committed: number };
type TrendRow = { bucket: string; counts: Partial<Record<PipelineStage, number>> };

/**
 * The analytics page as a workbook, for the round it is showing (`?round=` when it is one
 * of this business's rounds, else the live one, else the newest) and its time grain:
 * funnel with median days in stage, sources, stage entries over time, round progress,
 * meetings, outreach, readiness, diligence and data-room activity -- all counted from the
 * business's own records, as on screen.
 */
export const fundingAnalyticsExport: ExportAdapter<Filters> = {
  id: "funding.analytics",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => ({ roundId: idParam(params, "round"), grain: params.get("grain") === "month" ? "month" : "week" }),
  describeFilters: (f) => ({ Round: f.roundId ?? "", "Time series": f.grain === "month" ? "Monthly" : "Weekly" }),
  async load(context, filters) {
    const businessId = context.businessId;
    const rounds = await listRounds(businessId);
    // A round id from the request only selects among this business's own rounds.
    const round = (filters.roundId ? rounds.find((r) => r.id === filters.roundId) : undefined) ?? pickActiveRound(rounds) ?? rounds[0] ?? null;
    const [investors, pipeline, history, meetings, outreach, readiness, dataRoom, shares, diligence] = await Promise.all([
      listInvestors(businessId, "all"),
      round ? listPipeline(businessId, { roundId: round.id }) : Promise.resolve([]),
      round ? listStageHistory(businessId, round.id) : Promise.resolve([]),
      round ? listInteractions(businessId, { roundId: round.id, type: "meeting" }) : Promise.resolve([]),
      listOutreach(businessId),
      listReadinessItems(businessId),
      listDataRoomItems(businessId, { includeSuperseded: true }),
      listShares(businessId),
      listDiligence(businessId),
    ]);
    const now = new Date();
    const funnel = investorFunnel(pipeline, history);
    const readinessS = readinessSummary(readiness, now.toISOString().slice(0, 10));
    const dataRoomS = dataRoomSummary(dataRoom, shares, now);
    const sent = outreach.filter((o) => o.status === "sent" || o.status === "replied" || (o.status === "closed" && o.sentAt));
    const replied = outreach.filter((o) => o.status === "replied");

    const sourceColumns: ExportColumn<SourceRow>[] = [
      { key: "source", header: "Source", getValue: (s) => INVESTOR_SOURCE_LABEL[s.source as InvestorSource] ?? s.source },
      { key: "investors", header: "Investors", type: "integer", getValue: (s) => s.investors },
      { key: "inPipeline", header: "In pipeline", type: "integer", getValue: (s) => s.inPipeline },
      { key: "committed", header: "Committed", type: "integer", getValue: (s) => s.committed },
    ];
    const trendColumns: ExportColumn<TrendRow>[] = [
      { key: "bucket", header: filters.grain === "week" ? "Week of" : "Month", getValue: (r) => r.bucket, type: filters.grain === "week" ? "date" : "text" },
      ...SERIES_STAGES.map((s) => ({ key: s, header: PIPELINE_STAGE_LABEL[s], type: "integer" as const, getValue: (r: TrendRow) => r.counts[s] ?? 0 })),
    ];
    const meetingColumns: ExportColumn<Interaction>[] = [
      { key: "when", header: "When", type: "datetime", getValue: (i) => i.occurredAt },
      { key: "investor", header: "Investor", getValue: (i) => i.investorName },
      { key: "subject", header: "Subject", getValue: (i) => i.subject },
      { key: "outcome", header: "Outcome", getValue: (i) => i.outcome },
      { key: "nextAction", header: "Next action", getValue: (i) => i.nextAction },
    ];
    const outreachRows: CountRow[] = [
      { label: "Outreach sent", value: sent.length },
      { label: "Replies", value: replied.length },
      { label: "Reply rate (share of sent)", value: sent.length ? replied.length / sent.length : null },
    ];
    const readinessRows: CountRow[] = [
      { label: "Ready", value: readinessS.ready },
      { label: "Needs attention", value: readinessS.needsAttention },
      { label: "Missing", value: readinessS.missing },
      { label: "Overdue", value: readinessS.overdue },
      { label: "Completion (share of applicable items marked Ready by a person)", value: readinessS.completion },
    ];
    const diligenceRows: CountRow[] = [
      { label: "Diligence requests", value: diligence.length },
      ...DILIGENCE_STATUSES.map((s) => ({ label: DILIGENCE_STATUS_LABEL[s], value: diligence.filter((d) => d.status === s).length })),
    ];
    const dataRoomRows: CountRow[] = [
      { label: "Documents ready", value: dataRoomS.ready },
      { label: "Missing", value: dataRoomS.missing },
      { label: "Expired", value: dataRoomS.expired },
      { label: "Live share links", value: dataRoomS.activeShares },
      { label: "Times opened", value: dataRoomS.accessEvents },
    ];

    return {
      module: "discovery",
      resource: "funding-analytics",
      title: "Funding analytics",
      metadata: {
        Round: round ? round.name : "No round yet",
        "Time series": filters.grain === "month" ? "Monthly" : "Weekly",
      },
      sheets: [
        { sheetName: "Funnel", columns: funnelColumns(true), rows: pipeline.length > 0 ? funnelRows(funnel, timeInStage(history)) : [] },
        { sheetName: "Source", columns: sourceColumns, rows: sourceBreakdown(investors, pipeline) },
        { sheetName: "Pipeline Trend", columns: trendColumns, rows: stageEntriesByPeriod(history, filters.grain, SERIES_STAGES) },
        { sheetName: "Round Progress", columns: roundColumns(now), rows: round ? [{ round, progress: roundProgress(round, pipeline) }] : [] },
        { sheetName: "Meetings", columns: meetingColumns, rows: meetings },
        { sheetName: "Outreach", columns: COUNT_COLUMNS, rows: outreachRows },
        { sheetName: "Readiness", columns: COUNT_COLUMNS, rows: readinessRows },
        { sheetName: "Diligence", columns: COUNT_COLUMNS, rows: diligenceRows },
        { sheetName: "Data room", columns: COUNT_COLUMNS, rows: dataRoomRows },
      ],
    };
  },
};
