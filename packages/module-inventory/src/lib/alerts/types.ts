/** Mirrors `inventory.alerts` -- a real inventory-schema table (SP-3a/SP-3b),
 * `business_id`-keyed, populated by `inventory.check_stock_alerts()`'s own trigger
 * (fires on every stock_movements insert) rather than written directly by the app. */
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export type Alert = {
  id: string;
  business_id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: AlertStatus;
  recommended_action: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};
