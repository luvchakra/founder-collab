import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { fsmAssessmentExport } from "./assessment";
import { fsmCustomersExport } from "./customers";
import { fsmDashboardExport } from "./dashboard";
import { fsmInvoicesExport } from "./invoices";
import { fsmJobsExport } from "./jobs";
import { fsmMyDayExport } from "./my-day";
import { fsmOpportunitiesExport } from "./opportunities";
import { fsmReportsExport } from "./reports";
import { fsmScheduleExport } from "./schedule";

/**
 * Every Service (FSM) export adapter (EXP-FSM-01..09), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const FSM_EXPORTS: ExportAdapter<any>[] = [
  fsmDashboardExport, // EXP-FSM-01
  fsmCustomersExport, // EXP-FSM-02
  fsmJobsExport, // EXP-FSM-03
  fsmOpportunitiesExport, // EXP-FSM-04
  fsmInvoicesExport, // EXP-FSM-05
  fsmScheduleExport, // EXP-FSM-06
  fsmMyDayExport, // EXP-FSM-07
  fsmReportsExport, // EXP-FSM-08
  fsmAssessmentExport, // EXP-FSM-09
];
