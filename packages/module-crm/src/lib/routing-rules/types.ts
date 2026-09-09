export type KnownSenderCondition = "any" | "known" | "new";

export type RoutingRule = {
  id: string;
  business_id: string;
  name: string;
  channel_id: string | null;
  assign_to_employee_id: string | null;
  priority: number;
  is_active: boolean;
  /** docs/design/crm-module-design.md Part B, B3 -- 'known' matches only a sender
   * with prior fsm/inventory activity, 'new' only a stranger, 'any' (the default)
   * doesn't filter on this at all. */
  condition_known_sender: KnownSenderCondition;
  /** Both null (no business-hours condition) or both set -- a rule with these set
   * only matches while the current time of day falls inside the window. */
  business_hours_start: string | null;
  business_hours_end: string | null;
  /** Schema-only for now -- see the routing-rules-extensions migration's own header
   * comment on why this isn't evaluated yet. */
  detected_intent_filter: string[] | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};
