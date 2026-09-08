import type { InvoiceListItem } from "../invoices/types";
import type { Job } from "../jobs/types";
import type { OpportunityListItem } from "../opportunities/types";
import type { ScheduleEventItem } from "../events/types";

/** Narrower than `JobListItem` -- the dashboard only needs the customer name, not the
 * service-type join `listJobs()` also does, so `getDispatcherDashboard()` resolves just
 * this much rather than reusing that heavier query for two small, status-filtered
 * slices. */
export type DashboardJobItem = Job & { party_name: string };

/** `/fsm` dispatcher dashboard's own read (PRD §5: "today's schedule, unassigned queue,
 * jobs in progress, overdue invoices, estimates awaiting response") -- five small,
 * already-bounded lists, not a paginated view; each one links through to the fuller
 * page (Schedule, Jobs, Invoices, Opportunities) that actually manages that data. */
export interface DispatcherDashboard {
  todaysEvents: ScheduleEventItem[];
  unassignedJobs: DashboardJobItem[];
  jobsInProgress: DashboardJobItem[];
  overdueInvoices: InvoiceListItem[];
  estimatesAwaitingResponse: OpportunityListItem[];
}
