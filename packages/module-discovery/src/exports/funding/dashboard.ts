// EXP-FND-01 -- Funding dashboard export (/discovery/funding).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { getFundingFinanceSnapshot } from "@cofounderai/module-gst/contract/index";
import {
  getFundingProfile,
  listDataRoomItems,
  listDiligence,
  listInteractions,
  listInvestors,
  listOutreach,
  listPipeline,
  listReadinessItems,
  listRounds,
  listStageHistory,
  pickActiveRound,
} from "../../lib/funding/queries";
import { fundingAttention } from "../../lib/funding/attention";
import { investorFunnel, readinessSummary, roundProgress, type Figure } from "../../lib/funding/metrics";
import { DILIGENCE_STATUSES, DILIGENCE_STATUS_LABEL } from "../../lib/funding/types";
import {
  ATTENTION_COLUMNS,
  COUNT_COLUMNS,
  FIGURE_COLUMNS,
  figureRow,
  financeFigures,
  financeSource,
  funnelColumns,
  funnelRows,
  roundColumns,
  type CountRow,
  type FigureRow,
} from "./shared";

const ACTIVE_STAGES = new Set(["contacted", "meeting", "partner_review", "due_diligence", "term_discussion"]);

/**
 * The dashboard's numbers in the page's own words, for the round in focus (the live
 * primary round, by the page's rule): key figures with their kind and source, the round's
 * progress, the investor funnel, readiness and diligence counts, and the rule-based
 * attention list. Finance figures come only through module-gst's contract; when Finance
 * is unlicensed or not set up they are blank with a source column that says so (§45) --
 * never a stale or guessed number.
 */
export const fundingDashboardExport: ExportAdapter<Record<string, never>> = {
  id: "funding.dashboard",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const rounds = await listRounds(businessId);
    const round = pickActiveRound(rounds);
    const [profile, investors, pipeline, history, outreach, readiness, dataRoom, diligence, meetings, finance] = await Promise.all([
      getFundingProfile(businessId),
      listInvestors(businessId),
      round ? listPipeline(businessId, { roundId: round.id }) : Promise.resolve([]),
      round ? listStageHistory(businessId, round.id) : Promise.resolve([]),
      listOutreach(businessId),
      listReadinessItems(businessId),
      listDataRoomItems(businessId),
      listDiligence(businessId),
      round ? listInteractions(businessId, { roundId: round.id, type: "meeting" }) : Promise.resolve([]),
      getFundingFinanceSnapshot(businessId),
    ]);
    const now = new Date();
    const progress = round ? roundProgress(round, pipeline) : null;
    const funnel = investorFunnel(pipeline, history);
    const { data: financeData } = financeSource(finance);
    const attention = fundingAttention({
      profile,
      round,
      investors,
      pipeline,
      outreach,
      readiness,
      dataRoom,
      diligence,
      financeAvailable: financeData !== null,
      now,
    });

    const records = "Funding records";
    const count = (value: number, definition: string): Figure => ({ value, kind: "actual", definition });
    const summary: FigureRow[] = [
      ...(progress && round
        ? [
            figureRow("Target", progress.target, `Round: ${round.name}`, round.currency),
            figureRow("Committed", progress.committed, `Round: ${round.name}`, round.currency),
            figureRow("Raised", progress.raised, `Round: ${round.name}`, round.currency),
            figureRow("Remaining", progress.remaining, `Round: ${round.name}`, round.currency),
          ]
        : []),
      figureRow("Investors identified", count(investors.length, "Active investors in your database."), records),
      figureRow(
        "In this round's pipeline",
        count(pipeline.filter((p) => p.stage !== "passed").length, "Investors added to the round's pipeline, excluding those who passed."),
        records,
      ),
      figureRow(
        "Active conversations",
        count(pipeline.filter((p) => ACTIVE_STAGES.has(p.stage)).length, "Investors between Contacted and Term discussion."),
        records,
      ),
      figureRow("Meetings logged", count(meetings.length, "Meeting interactions logged against this round."), records),
      figureRow(
        "Diligence open",
        count(diligence.filter((d) => d.status !== "accepted" && d.status !== "closed").length, "Requests not yet accepted or closed."),
        records,
      ),
      figureRow("Data room missing", count(dataRoom.filter((d) => d.status === "missing").length, "Checklist documents with no file uploaded."), records),
      figureRow(
        "Days in round",
        {
          value: round?.openedAt ? Math.max(0, Math.floor((now.getTime() - new Date(round.openedAt).getTime()) / 86_400_000)) : null,
          kind: "actual",
          definition: "Days since the round was opened. Blank until it is opened.",
        },
        records,
      ),
      ...financeFigures(finance),
    ];

    const today = now.toISOString().slice(0, 10);
    const r = readinessSummary(readiness, today);
    const readinessRows: CountRow[] = [
      { label: "Ready", value: r.ready },
      { label: "Needs attention", value: r.needsAttention },
      { label: "Missing", value: r.missing },
      { label: "Not applicable", value: r.notApplicable },
      { label: "Overdue", value: r.overdue },
      { label: "Completion (share of applicable items marked Ready by a person)", value: r.completion },
    ];
    const diligenceRows: CountRow[] = DILIGENCE_STATUSES.map((s) => ({ label: DILIGENCE_STATUS_LABEL[s], value: diligence.filter((d) => d.status === s).length }));
    const statusColumns: ExportColumn<CountRow>[] = [
      { key: "status", header: "Status", getValue: (row) => row.label },
      { key: "count", header: "Requests", type: "integer", getValue: (row) => row.value },
    ];

    return {
      module: "discovery",
      resource: "funding-dashboard",
      title: "Funding dashboard",
      metadata: { Round: round ? round.name : "No live round" },
      sheets: [
        { sheetName: "Summary", columns: FIGURE_COLUMNS, rows: summary },
        { sheetName: "Round", columns: roundColumns(now), rows: round && progress ? [{ round, progress }] : [] },
        { sheetName: "Investor Funnel", columns: funnelColumns(), rows: pipeline.length > 0 ? funnelRows(funnel) : [] },
        { sheetName: "Readiness", columns: COUNT_COLUMNS, rows: readinessRows },
        { sheetName: "Diligence", columns: statusColumns, rows: diligenceRows },
        { sheetName: "Attention", columns: ATTENTION_COLUMNS, rows: attention },
      ],
    };
  },
};
