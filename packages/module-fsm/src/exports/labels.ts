import type { PaymentMethod } from "@cofounderai/core/payments/types";
import type { AssessmentKind, AssessmentStatus } from "../lib/assessments/types";
import type { EventKind, EventStatus } from "../lib/events/types";
import type { InvoiceStatus } from "../lib/invoices/types";
import type { JobOutcome, JobStatus } from "../lib/jobs/types";
import type { OpportunitySource, OpportunityStatus } from "../lib/opportunities/types";

/**
 * EXP-FSM-01..09 -- the human labels Service exports write in place of enum codes (§43).
 *
 * Each map repeats, word for word, the label the page itself shows; those maps are local
 * to their (client) components -- jobs-list.tsx, invoices-list.tsx, opportunities-list
 * .tsx, job-detail.tsx, invoice-editor.tsx, create-event-dialog.tsx and the assessment
 * detail page -- so they are mirrored here rather than imported from a component. Where
 * the UI shows the raw value (an event's status, an opportunity's source), the label is
 * the obvious title-cased form.
 */

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const JOB_OUTCOME_LABEL: Record<JobOutcome, string> = {
  completed_successfully: "Completed successfully",
  completed_with_recommendation: "Completed with recommendation",
  additional_work_required: "Additional work required",
  parts_required_later: "Parts required later",
  customer_declined_additional_work: "Customer declined additional work",
  warranty_revisit_required: "Warranty/revisit required",
  unresolved: "Unresolved",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  voided: "Voided",
};

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  new: "New",
  estimate_scheduled: "Estimate Scheduled",
  estimate_sent: "Estimate Sent",
  won: "Won",
  lost: "Lost",
};

export const OPPORTUNITY_SOURCE_LABEL: Record<OpportunitySource, string> = {
  manual: "Manual",
  contact_form: "Contact form",
  discovery: "Discovery",
  import: "Import",
  api: "API",
  crm: "CRM",
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  work: "Work",
  estimate: "Estimate visit",
  reminder: "Reminder",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: "Scheduled",
  en_route: "On the way",
  arrived: "Arrived",
  done: "Done",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
  bank: "Bank transfer",
  card_offline: "Card (offline)",
  other: "Other",
};

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  remote: "Remote",
  on_site: "On-site",
  technical: "Technical",
};

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  completed: "Completed",
  not_feasible: "Not feasible",
  cancelled: "Cancelled",
};

/** A label for `code` from `map`, the code itself when the map doesn't know it (a value
 * added to the database enum later), blank when there is no code. */
export function labelFor<K extends string>(map: Record<K, string>, code: string | null | undefined): string | null {
  if (code == null || code === "") return null;
  return map[code as K] ?? code;
}
