// EXP-FSM-03 -- Service jobs export: every job on /[businessSlug]/service/jobs.
//
// The story's "priority" field is not exported: FSM jobs have no priority (fsm.jobs has no
// such column and no page shows one). Every other field is.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { JOB_OUTCOME_LABEL, JOB_STATUS_LABEL, OPPORTUNITY_SOURCE_LABEL, labelFor } from "./labels";
import { listJobsForExport, type JobExportRow } from "./queries";

export const fsmJobsExport: ExportAdapter<Record<string, never>> = {
  id: "fsm.jobs",
  module: "fsm",
  // The jobs page checks no permission of its own -- the fsm licence (checked by the
  // runner) and business membership (RLS) are what reading it takes.
  permissions: [],
  // The page has no filters (its board/table toggle is a view, not a filter).
  parseFilters: () => ({}),
  async load(context) {
    const jobs = await listJobsForExport(context.businessId);
    return {
      module: "fsm",
      resource: "jobs",
      title: "Service jobs",
      sheets: [
        {
          sheetName: "Jobs",
          columns: [
            { key: "number", header: "Job #", getValue: (j: JobExportRow) => j.number },
            { key: "customer", header: "Customer", getValue: (j: JobExportRow) => j.party_name },
            { key: "service", header: "Service type", getValue: (j: JobExportRow) => j.service_type_name },
            { key: "status", header: "Status", getValue: (j: JobExportRow) => labelFor(JOB_STATUS_LABEL, j.status) },
            { key: "technician", header: "Technician", getValue: (j: JobExportRow) => j.technician_names },
            { key: "scheduled", header: "Scheduled", type: "datetime", getValue: (j: JobExportRow) => j.scheduled_start },
            { key: "started", header: "Started", type: "datetime", getValue: (j: JobExportRow) => j.started_at },
            { key: "completed", header: "Completed", type: "datetime", getValue: (j: JobExportRow) => j.completed_at },
            { key: "outcome", header: "Outcome", getValue: (j: JobExportRow) => labelFor(JOB_OUTCOME_LABEL, j.outcome) },
            { key: "value", header: "Invoiced value", type: "currency", currency: "INR", getValue: (j: JobExportRow) => j.invoiced_amount },
            { key: "source", header: "Source", getValue: (j: JobExportRow) => labelFor(OPPORTUNITY_SOURCE_LABEL, j.opportunity_source) },
            { key: "description", header: "Description", getValue: (j: JobExportRow) => j.description },
            { key: "created", header: "Created", type: "datetime", getValue: (j: JobExportRow) => j.created_at },
          ],
          rows: jobs,
        },
      ],
    };
  },
};
