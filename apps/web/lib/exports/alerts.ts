import type { ShellAlert } from "@cofounderai/core/shell/types";
import { listMyRecentExportJobs } from "@cofounderai/core/exports/jobs";

/**
 * EXP-PLAT-06 -- "Export ready" (and "Export failed") in the bell, derived from the
 * signed-in user's own background export jobs, the same derived-not-stored model as every
 * other alert there. Each links to the job's download route, which re-checks ownership
 * and expiry. Jobs past their expiry drop out on their own.
 */
export async function getExportAlerts(): Promise<ShellAlert[]> {
  const jobs = await listMyRecentExportJobs();
  return jobs.map((job) =>
    job.status === "ready"
      ? {
          id: `export-ready-${job.id}`,
          severity: "info" as const,
          message: `Export ready: ${job.title}${job.rowCount != null ? ` (${job.rowCount.toLocaleString("en-IN")} rows)` : ""}`,
          href: `/api/exports/jobs/${job.id}/download`,
          businessId: job.businessId,
        }
      : {
          id: `export-failed-${job.id}`,
          severity: "warning" as const,
          message: `Export failed: ${job.title}. No data was changed -- try exporting again.`,
          href: `/api/exports/jobs/${job.id}/download`,
          businessId: job.businessId,
        },
  );
}
