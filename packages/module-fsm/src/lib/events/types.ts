export type EventKind = "work" | "estimate" | "reminder";
export type EventStatus = "scheduled" | "en_route" | "arrived" | "done" | "cancelled";

export interface ScheduleEvent {
  id: string;
  business_id: string;
  kind: EventKind;
  job_id: string | null;
  opportunity_id: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  description: string | null;
  status: EventStatus;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** The calendar's own row shape: an event plus everything the board needs to render a
 * card without a second round trip -- assignee employee ids, and a label for whichever
 * job/opportunity it's attached to (PRD §4's own check constraint guarantees exactly one
 * of the two is set). */
export interface ScheduleEventItem extends ScheduleEvent {
  assignee_employee_ids: string[];
  subject_label: string;
  party_name: string;
}

export interface CreateEventInput {
  kind: EventKind;
  jobId?: string | null;
  opportunityId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  description?: string;
  arrivalWindowStart?: string | null;
  arrivalWindowEnd?: string | null;
  assigneeEmployeeIds?: string[];
}

export interface RescheduleEventInput {
  startsAt: string;
  endsAt?: string | null;
}

export interface JobOption {
  id: string;
  number: string | null;
  party_name: string;
  status: string;
}

export interface OpportunityOption {
  id: string;
  number: string | null;
  party_name: string;
  status: string;
}
