export type EscalationStage = "reminder" | "owner_escalation" | "manager_escalation";

export type EscalationConfig = {
  businessId: string;
  reminderDelayMinutes: number;
  ownerEscalationDelayMinutes: number;
  managerEscalationDelayMinutes: number;
  managerEmployeeId: string | null;
};

/** CRM-09.8's own defaults -- the backlog's example sequence verbatim (15m / 1h / 4h).
 * `getEscalationConfig()` returns these for any business with no `crm.escalation_config`
 * row of its own yet, so "store business configuration" holds (a future edit is a real
 * row update, not a code change) without forcing every business to have a row from
 * day one. */
export const DEFAULT_ESCALATION_CONFIG: Omit<EscalationConfig, "businessId"> = {
  reminderDelayMinutes: 15,
  ownerEscalationDelayMinutes: 60,
  managerEscalationDelayMinutes: 240,
  managerEmployeeId: null,
};
