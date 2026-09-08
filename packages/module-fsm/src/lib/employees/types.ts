export interface EmployeeOption {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
}

/** A business member alongside whether they already have a `core.employees` row (i.e.
 * count as a technician who can be scheduled). Backs the roster toggle -- see
 * `setTechnicianStatus()`. */
export interface TechnicianRosterRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  employee_id: string | null;
  is_active: boolean;
}
