export type LicenseStatus = "active" | "grace" | "expired" | "cancelled";

/** PLATFORM-P0-07.1/07.3 -- `platform.modules.status`'s own four-value CHECK. `enabled`
 * (PLATFORM-P0-07.2) is derived from this column at the database level (`available`/
 * `read_only` -> true, `maintenance`/`disabled` -> false, a Postgres `generated always as`
 * column, not app-layer logic) -- see the PLATFORM-P0-07.3 reconciliation migration's own
 * docstring for why `status` is the single source of truth rather than a second,
 * independently-writable flag. */
export type PlatformModuleStatus = "available" | "read_only" | "maintenance" | "disabled";

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
