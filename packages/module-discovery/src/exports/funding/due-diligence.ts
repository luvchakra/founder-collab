// EXP-FND-10 -- Due diligence export (/discovery/funding/due-diligence).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listDiligence, listRounds } from "../../lib/funding/queries";
import { DILIGENCE_STATUSES, DILIGENCE_STATUS_LABEL, type DiligenceItem, type DiligenceStatus } from "../../lib/funding/types";

type Filters = { status: DiligenceStatus | "active" | "all" };

/**
 * The diligence queue with the page's "Show" filter (open work by default, everything,
 * or one status): each request, who asked, which round, when it is due, where it stands
 * and how much data-room evidence is linked. The response text itself stays in the app;
 * this is the queue, not the answers.
 */
export const fundingDueDiligenceExport: ExportAdapter<Filters> = {
  id: "funding.due-diligence",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => {
    const status = params.get("status");
    return {
      status: (DILIGENCE_STATUSES as readonly string[]).includes(status ?? "") ? (status as DiligenceStatus) : status === "all" ? "all" : "active",
    };
  },
  describeFilters: (f) => ({ Show: f.status === "active" ? "Open work" : f.status === "all" ? "Everything" : DILIGENCE_STATUS_LABEL[f.status] }),
  async load(context, filters) {
    const [items, rounds] = await Promise.all([
      listDiligence(context.businessId, filters.status === "all" ? undefined : filters.status),
      listRounds(context.businessId),
    ]);
    const roundName = new Map(rounds.map((r) => [r.id, r.name]));
    const today = new Date().toISOString().slice(0, 10);
    const columns: ExportColumn<DiligenceItem>[] = [
      { key: "request", header: "Request", getValue: (d) => d.request },
      { key: "investor", header: "Investor", getValue: (d) => d.investorName },
      { key: "requester", header: "Requester", getValue: (d) => d.requester },
      { key: "round", header: "Round", getValue: (d) => (d.roundId ? (roundName.get(d.roundId) ?? null) : null) },
      { key: "due", header: "Due", type: "date", getValue: (d) => d.dueAt },
      {
        key: "overdue",
        header: "Overdue",
        type: "boolean",
        getValue: (d) => d.dueAt !== null && d.dueAt < today && d.status !== "accepted" && d.status !== "closed",
      },
      { key: "status", header: "Status", getValue: (d) => DILIGENCE_STATUS_LABEL[d.status] ?? d.status },
      { key: "evidence", header: "Evidence documents", type: "integer", getValue: (d) => d.dataRoomItemIds.length },
      { key: "decided", header: "Decided", type: "datetime", getValue: (d) => d.decidedAt },
      { key: "updated", header: "Last update", type: "datetime", getValue: (d) => d.updatedAt },
    ];
    return {
      module: "discovery",
      resource: "funding-due-diligence",
      title: "Due diligence",
      sheets: [{ sheetName: "Due diligence", columns, rows: items }],
    };
  },
};
