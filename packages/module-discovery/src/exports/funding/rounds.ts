// EXP-FND-04 -- Fundraising rounds export (/discovery/funding/rounds).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listPipeline, listRounds } from "../../lib/funding/queries";
import { roundProgress } from "../../lib/funding/metrics";
import { roundColumns, type RoundRow } from "./shared";

/**
 * Every round, with the progress the page shows for it -- target, committed and raised
 * kept apart (a commitment is not money received), remaining, and the round's own terms.
 * Amounts in another currency than the round's are left out of its totals and counted,
 * never converted, exactly as `roundProgress` does on screen.
 */
export const fundingRoundsExport: ExportAdapter<Record<string, never>> = {
  id: "funding.rounds",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [rounds, pipeline] = await Promise.all([listRounds(context.businessId), listPipeline(context.businessId)]);
    const rows: RoundRow[] = rounds.map((round) => ({
      round,
      progress: roundProgress(
        round,
        pipeline.filter((p) => p.roundId === round.id),
      ),
    }));
    return {
      module: "discovery",
      resource: "funding-rounds",
      title: "Fundraising rounds",
      sheets: [{ sheetName: "Rounds", columns: roundColumns(), rows }],
    };
  },
};
