// EXP-CRM-10 (Exceptions) -- Exception Center export (/crm/exceptions).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { listCrossModuleExceptions } from "../lib/exceptions/queries";
import { exceptionsSheet } from "./sheets";

/**
 * Every open exception the page lists. The model records no severity, owner or
 * creation time, so the export has none of those columns rather than invented values.
 * FSM parts shortages come through FSM's contract; when FSM isn't licensed they are
 * absent from the page and the file, and the Excel info sheet says so (§45).
 */
export const crmExceptionsExport: ExportAdapter<Record<string, never>> = {
  id: "crm.exceptions",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [exceptions, fsmLicensed] = await Promise.all([
      listCrossModuleExceptions(context.businessId),
      hasModule(context.businessId, "fsm"),
    ]);
    return {
      module: "crm",
      resource: "exceptions",
      title: "CRM exceptions",
      metadata: fsmLicensed ? undefined : { "FSM parts shortages": "FSM unavailable (not licensed) -- not included" },
      sheets: [exceptionsSheet("Exceptions", exceptions)],
    };
  },
};
