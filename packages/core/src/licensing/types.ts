export type LicenseStatus = "active" | "grace" | "expired" | "cancelled";

/** Matches core.modules' seed rows (C-3) exactly. */
export type ModuleKey = "discovery" | "inventory" | "fsm" | "crm" | "gst";

export type License = {
  id: string;
  account_id: string;
  business_id: string;
  module_key: string;
  status: LicenseStatus;
  activated_at: string;
  deactivated_at: string | null;
  grace_ends_at: string | null;
  /** Set while status is still 'active' but a cancellation has been requested -- the
   * license keeps full read/write access until this date, then automatically starts
   * the usual grace period. Null outside that pending-cancellation window. */
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LicenseEventType =
  | "activated"
  | "deactivated"
  | "reactivated"
  | "expired"
  | "cancellation_scheduled"
  | "cancellation_undone";
