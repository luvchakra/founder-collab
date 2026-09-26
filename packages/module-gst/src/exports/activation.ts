// EXP-FIN-17 (Activation) -- Finance activation export (/finance/activate).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getActivationSummary } from "../lib/activation/queries";
import type { WizardStep } from "../lib/activation/types";
import { ACCOUNTING_METHOD_LABEL, MONTH_LABEL } from "./labels";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS } from "./shared";

type SettingRow = { setting: string; value: string | null; at: string | null };

/**
 * The activation page's checklist and settings, from the page's own
 * `getActivationSummary`: each setup step with whether it is done and the page's detail
 * line, then the accounting method, fiscal-year start and when Finance was activated.
 * Setup state only -- no credential, key or provider configuration is part of the summary.
 * The page reads with no permission check (`gst.activation.manage` only enables changes).
 */
export const financeActivationExport: ExportAdapter<Record<string, never>> = {
  id: "finance.activation",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const summary = await getActivationSummary(context.businessId);
    const settings: SettingRow[] = [
      {
        setting: "Accounting method",
        value: ACCOUNTING_METHOD_LABEL[summary.settings.accountingMethod] ?? summary.settings.accountingMethod,
        at: null,
      },
      {
        setting: "Fiscal year starts in",
        value: MONTH_LABEL[summary.settings.fiscalYearStartMonth - 1] ?? String(summary.settings.fiscalYearStartMonth),
        at: null,
      },
      {
        setting: "Finance activated",
        value: summary.activation.activatedAt ? "Yes" : "No",
        at: summary.activation.activatedAt,
      },
    ];
    const settingsSheet: ExportSheet<SettingRow> = {
      sheetName: "Settings",
      rows: settings,
      columns: [
        { key: "setting", header: "Setting", getValue: (r) => r.setting },
        { key: "value", header: "Value", getValue: (r) => r.value },
        { key: "at", header: "Date", type: "datetime", getValue: (r) => r.at },
      ],
    };

    return {
      module: FINANCE_FILE_MODULE,
      resource: "activation",
      title: "Finance activation",
      sheets: [
        {
          sheetName: "Checklist",
          rows: summary.steps,
          columns: [
            { key: "step", header: "Step", getValue: (s: WizardStep) => s.label },
            { key: "status", header: "Status", getValue: (s: WizardStep) => (s.complete ? "Done" : "To do") },
            { key: "complete", header: "Complete", type: "boolean", getValue: (s: WizardStep) => s.complete },
            { key: "detail", header: "Detail", getValue: (s: WizardStep) => s.detail },
          ],
        },
        settingsSheet,
      ],
    };
  },
};
