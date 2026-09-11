export type JobStatus = "unscheduled" | "scheduled" | "in_progress" | "on_hold" | "completed" | "cancelled";

/** INT-03.2: outcome of the job's own last parts-reservation attempt
 * (`reserveJobParts()`, `lib/inventory-integration/mutations.ts`) -- not a stock ledger,
 * Inventory's `stock_movements`/`stock_levels` remain the only authority on what
 * actually moved and what's currently available; this is a small FSM-owned fact about
 * the job itself, the same kind of thing `status`/`on_hold_reason` already are. */
export type JobPartsReservationStatus = "reserved" | "partially_reserved" | "unavailable";

export type JobPartsShortfallLine = {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  unit: string;
  requested: number;
  shortfall: number;
};

/** INT-03.3: the founder's explicit choice of how to handle a shortage
 * (`parts_reservation_status` of `partially_reserved`/`unavailable`) -- orthogonal to
 * that status, which stays Inventory's own live truth; this records what the founder
 * decided to do about it. "Reschedule" and "substitute" point at existing/future
 * mechanisms elsewhere (Schedule, INT-05.2's own substitution recommendation) rather
 * than duplicating them here -- this column only records the decision itself. */
export type JobPartsShortageResolution = "await_replenishment" | "substitute_item" | "reschedule_job" | "obtain_manually";

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
  parts_reservation_status: JobPartsReservationStatus | null;
  parts_reservation_detail: JobPartsShortfallLine[] | null;
  parts_reservation_checked_at: string | null;
  parts_shortage_resolution: JobPartsShortageResolution | null;
  parts_shortage_resolution_note: string | null;
  parts_shortage_resolved_at: string | null;
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
