// EXP-CRM-07 -- Follow-up Queue export (/crm/follow-ups): the current view and filters.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { applyFollowUpQueueFilters, type FollowUpQueueView } from "../lib/follow-ups/queue";
import type { FollowUpPriority, FollowUpQueueRow } from "../lib/follow-ups/types";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { CHANNEL_LABEL, SOURCE_CHANNEL_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";
import { listFollowUpQueueForExport } from "./queries";

const VIEWS: Record<FollowUpQueueView, string> = {
  all: "All",
  due_today: "Due today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  unassigned: "Unassigned",
  high_priority: "High priority",
};
const PRIORITIES: FollowUpPriority[] = ["low", "normal", "high"];

export type FollowUpExportFilters = {
  view: FollowUpQueueView;
  ownerId: string;
  source: string;
  channel: string;
  priority: FollowUpPriority | "";
};

/** Same whitelist and defaults as the page: an unknown view is "all", an unknown
 * priority is no priority filter. */
export function parseFollowUpFilters(params: URLSearchParams): FollowUpExportFilters {
  const view = params.get("view") ?? "";
  const priority = params.get("priority") ?? "";
  return {
    view: view in VIEWS ? (view as FollowUpQueueView) : "all",
    ownerId: params.get("ownerId") ?? "",
    source: params.get("source") ?? "",
    channel: params.get("channel") ?? "",
    priority: PRIORITIES.includes(priority as FollowUpPriority) ? (priority as FollowUpPriority) : "",
  };
}

export const crmFollowUpsExport: ExportAdapter<FollowUpExportFilters> = {
  id: "crm.follow-ups",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: parseFollowUpFilters,
  describeFilters: (f) => ({
    View: VIEWS[f.view],
    Owner: f.ownerId ? "Selected owner" : "",
    Source: f.source ? labelOf(SOURCE_CHANNEL_LABEL, f.source) : "",
    Channel: f.channel ? labelOf(CHANNEL_LABEL, f.channel) : "",
    Priority: humanize(f.priority),
  }),
  async load(context, filters) {
    const [queue, employees] = await Promise.all([listFollowUpQueueForExport(context.businessId), listEmployeeOptions(context.businessId)]);
    const now = new Date();
    const rows = applyFollowUpQueueFilters(
      queue,
      {
        view: filters.view,
        ownerId: filters.ownerId || undefined,
        source: filters.source || undefined,
        channel: filters.channel || undefined,
        priority: filters.priority || undefined,
      },
      now,
    );
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const employeeById = employeeMap(employees);

    return {
      module: "crm",
      resource: "follow-ups",
      title: "CRM follow-up queue",
      sheets: [
        {
          sheetName: "Follow-ups",
          columns: [
            {
              key: "contact",
              header: "Contact",
              getValue: (r: FollowUpQueueRow) => r.partyName ?? r.reviewSummary ?? r.productInterestSummary ?? "Unknown contact",
            },
            {
              key: "context",
              header: "Context",
              getValue: (r: FollowUpQueueRow) => (r.partyName ? (r.reviewSummary ?? r.productInterestSummary ?? "") : ""),
            },
            { key: "source", header: "Source", getValue: (r: FollowUpQueueRow) => labelOf(SOURCE_CHANNEL_LABEL, r.source) },
            { key: "channel", header: "Channel", getValue: (r: FollowUpQueueRow) => labelOf(CHANNEL_LABEL, r.channel) },
            { key: "priority", header: "Priority", getValue: (r: FollowUpQueueRow) => humanize(r.priority) },
            { key: "due", header: "Due", type: "datetime", getValue: (r: FollowUpQueueRow) => r.due_at },
            { key: "overdue", header: "Overdue", type: "boolean", getValue: (r: FollowUpQueueRow) => new Date(r.due_at).getTime() < todayStart },
            { key: "owner", header: "Owner", getValue: (r: FollowUpQueueRow) => ownerName(employeeById, r.owner_id) },
            { key: "status", header: "Status", getValue: (r: FollowUpQueueRow) => humanize(r.status) },
            { key: "completed", header: "Completed", type: "datetime", getValue: (r: FollowUpQueueRow) => r.completed_at },
          ],
          rows,
        },
      ],
    };
  },
};
