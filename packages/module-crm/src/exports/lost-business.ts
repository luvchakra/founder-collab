// EXP-CRM-05 -- Potential Lost Business export (/crm/lost-business).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listPotentialLostBusinessQueue } from "../lib/interactions/queries";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { listPotentialLostBusinessQueueForExport } from "./queries";
import { lostBusinessSheet } from "./sheets";

/**
 * The page shows the 200 oldest unanswered commercial messages: "current view" is that
 * same list (the page's own loader), "all matching records" every unanswered one, same
 * predicates. Raw message content is excluded -- the queue's columns are metadata
 * (age, contact, channel, intent, value, owner, SLA, state) only.
 */
export const crmLostBusinessExport: ExportAdapter<Record<string, never>> = {
  id: "crm.lost-business",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [queue, employees] = await Promise.all([
      context.scope === "all"
        ? listPotentialLostBusinessQueueForExport(context.businessId)
        : listPotentialLostBusinessQueue(context.businessId),
      listEmployeeOptions(context.businessId),
    ]);
    return {
      module: "crm",
      resource: "lost-business",
      title: "CRM potential lost business",
      sheets: [lostBusinessSheet("Lost Business", queue, employees)],
    };
  },
};
