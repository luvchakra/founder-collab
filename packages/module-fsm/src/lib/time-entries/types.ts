export interface TimeEntry {
  id: string;
  business_id: string;
  job_id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  hourly_rate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryItem extends TimeEntry {
  employee_name: string;
}

/** Whichever job (if any) the caller is currently clocked into, business-wide -- the
 * DB's own `time_entries_one_open_per_employee` unique index (F-1) is the actual
 * enforcement; this is just the read the UI needs to know what state it's in. */
export interface OpenTimeEntry {
  id: string;
  job_id: string;
  started_at: string;
}
