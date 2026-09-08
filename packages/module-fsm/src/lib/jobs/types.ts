export type JobStatus = "unscheduled" | "scheduled" | "in_progress" | "on_hold" | "completed" | "cancelled";

export interface Job {
  id: string;
  business_id: string;
  number: string | null;
  opportunity_id: string | null;
  party_id: string;
  primary_contact_id: string | null;
  service_address_id: string | null;
  service_type_id: string | null;
  description: string | null;
  scope_of_work: string | null;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  on_hold_reason: string | null;
  recurring_template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface JobListItem extends Job {
  party_name: string;
  service_type_name: string | null;
}

export interface CreateJobInput {
  partyId?: string;
  newCustomer?: { name: string; email?: string; phone?: string };
  serviceTypeId?: string | null;
  description?: string;
  scopeOfWork?: string;
}

export interface UpdateJobInput {
  serviceTypeId?: string | null;
  description?: string | null;
  scopeOfWork?: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}
