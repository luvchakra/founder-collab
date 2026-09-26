// EXP-FND-08 -- Investor outreach export (/discovery/funding/outreach).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listRounds } from "../../lib/funding/queries";
import { OUTREACH_STATUSES, OUTREACH_STATUS_LABEL, type OutreachStatus } from "../../lib/funding/types";
import { OUTREACH_ORIGIN_LABEL } from "./investor-detail";
import { listOutreachForExport, type OutreachExportRow } from "./queries";

type Filters = { status?: OutreachStatus };

/**
 * The outreach list with the page's status filter: who it went (or goes) to, for which
 * round, whether a person wrote it or it started as an AI draft, and each step of
 * draft -> approval -> send -> response with its time. Metadata only: the email body stays
 * in the app, and nothing from the email provider (message ids, configuration) is
 * exported. Meetings and next actions are recorded as investor interactions, not on
 * outreach, and are in the investor detail export.
 */
export const fundingOutreachExport: ExportAdapter<Filters> = {
  id: "funding.outreach",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => {
    const status = params.get("status");
    return { status: (OUTREACH_STATUSES as readonly string[]).includes(status ?? "") ? (status as OutreachStatus) : undefined };
  },
  describeFilters: (f) => ({ Status: f.status ? OUTREACH_STATUS_LABEL[f.status] : "" }),
  async load(context, filters) {
    const [drafts, rounds] = await Promise.all([listOutreachForExport(context.businessId, { status: filters.status }), listRounds(context.businessId)]);
    const roundName = new Map(rounds.map((r) => [r.id, r.name]));
    const columns: ExportColumn<OutreachExportRow>[] = [
      { key: "investor", header: "Investor", getValue: (o) => o.investorName },
      { key: "recipient", header: "Recipient", getValue: (o) => o.recipientEmail },
      { key: "round", header: "Round", getValue: (o) => (o.roundId ? (roundName.get(o.roundId) ?? null) : null) },
      { key: "type", header: "Outreach type", getValue: () => "Email" },
      { key: "subject", header: "Subject", getValue: (o) => o.subject },
      { key: "origin", header: "Origin", getValue: (o) => OUTREACH_ORIGIN_LABEL[o.origin] ?? o.origin },
      { key: "status", header: "Status", getValue: (o) => OUTREACH_STATUS_LABEL[o.status] ?? o.status },
      { key: "created", header: "Created", type: "datetime", getValue: (o) => o.createdAt },
      { key: "approved", header: "Approved", type: "datetime", getValue: (o) => o.approvedAt },
      { key: "sent", header: "Sent", type: "datetime", getValue: (o) => o.sentAt },
      { key: "response", header: "Response", getValue: (o) => (o.status === "replied" ? "Replied" : null) },
      { key: "failure", header: "Failure reason", getValue: (o) => o.failureReason },
      { key: "updated", header: "Updated", type: "datetime", getValue: (o) => o.updatedAt },
    ];
    return {
      module: "discovery",
      resource: "funding-outreach",
      title: "Investor outreach",
      sheets: [{ sheetName: "Outreach", columns, rows: drafts }],
    };
  },
};
