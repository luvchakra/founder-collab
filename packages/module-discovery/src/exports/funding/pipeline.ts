// EXP-FND-07 -- Investor pipeline export. There is no separate pipeline page: a round's
// pipeline is rendered on /discovery/funding/rounds/[roundId], so that is where it exports.
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { getRound, listPipeline, listStageHistory } from "../../lib/funding/queries";
import { investorFunnel, timeInStage } from "../../lib/funding/metrics";
import { PIPELINE_ORDER } from "../../lib/funding/lifecycle";
import { INVESTOR_SOURCE_LABEL, PIPELINE_STAGE_LABEL, type Investor, type PipelineRecord } from "../../lib/funding/types";
import { listInvestorsForExport } from "./queries";
import { funnelColumns, funnelRows, idParam } from "./shared";

type Filters = { roundId?: string };

const STAGE_ORDER = [...PIPELINE_ORDER, "passed" as const];

/**
 * One round's investor pipeline, grouped by stage in the page's order: stage, when it was
 * entered and how long ago, how the investor was found, amounts committed and received,
 * next action. Plus the round's funnel with median days in stage. The round id comes from
 * the request but is only loaded together with `context.businessId`; another business's
 * round is "not found", as on the page.
 */
export const fundingPipelineExport: ExportAdapter<Filters> = {
  id: "funding.pipeline",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => ({ roundId: idParam(params, "roundId") }),
  describeFilters: (f) => ({ Round: f.roundId ?? "" }),
  async load(context, filters) {
    const round = filters.roundId ? await getRound(context.businessId, filters.roundId) : null;
    if (!round) throw new ExportDeniedError("Round not found.", 404);
    const [pipeline, history, investors] = await Promise.all([
      listPipeline(context.businessId, { roundId: round.id }),
      listStageHistory(context.businessId, round.id),
      listInvestorsForExport(context.businessId, "all"),
    ]);
    const investorById = new Map<string, Investor>(investors.map((i) => [i.id, i]));
    const now = new Date();
    const rows = [...pipeline].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

    const columns: ExportColumn<PipelineRecord>[] = [
      { key: "investor", header: "Investor", getValue: (p) => p.investorName },
      { key: "round", header: "Round", getValue: () => round.name },
      { key: "stage", header: "Stage", getValue: (p) => PIPELINE_STAGE_LABEL[p.stage] ?? p.stage },
      { key: "previous", header: "Previous stage", getValue: (p) => (p.previousStage ? PIPELINE_STAGE_LABEL[p.previousStage] : null) },
      { key: "entered", header: "Stage entered", type: "datetime", getValue: (p) => p.stageEnteredAt },
      {
        key: "age",
        header: "Days in stage",
        type: "integer",
        getValue: (p) => Math.max(0, Math.floor((now.getTime() - new Date(p.stageEnteredAt).getTime()) / 86_400_000)),
      },
      {
        key: "source",
        header: "Source",
        getValue: (p) => {
          const source = investorById.get(p.investorId)?.source;
          return source ? (INVESTOR_SOURCE_LABEL[source] ?? source) : null;
        },
      },
      { key: "committed", header: "Committed amount", type: "currency", getValue: (p) => p.committedAmount },
      { key: "invested", header: "Received amount", type: "currency", getValue: (p) => p.investedAmount },
      { key: "currency", header: "Currency", getValue: (p) => p.currency },
      { key: "nextAction", header: "Next action", getValue: (p) => p.nextAction },
      { key: "nextDue", header: "Next action due", type: "date", getValue: (p) => p.nextActionDue },
      { key: "passReason", header: "Pass reason", getValue: (p) => p.passReason },
      { key: "lastInteraction", header: "Last interaction", type: "datetime", getValue: (p) => p.lastInteractionAt },
    ];

    return {
      module: "discovery",
      resource: "funding-pipeline",
      title: `Investor pipeline: ${round.name}`,
      metadata: { Round: round.name },
      sheets: [
        { sheetName: "Pipeline", columns, rows },
        { sheetName: "Funnel", columns: funnelColumns(true), rows: pipeline.length > 0 ? funnelRows(investorFunnel(pipeline, history), timeInStage(history)) : [] },
      ],
    };
  },
};
