export type GstRecordRetentionRuleValue = {
  months: number;
  /** What the retention period counts FROM -- India's own rule (Section 36 of the CGST
   * Act) counts from the annual return's own due date; Singapore's own rule (COMPLY-
   * P1-04.7) counts from the end of the relevant GST accounting period, a genuinely
   * simpler basis with no annual-return-due-date dependency at all. Named explicitly
   * rather than assumed, matching every other rule value in this module that isn't
   * self-evidently a bare number -- a THIRD basis a future regime needs is an
   * application-code addition here, not a schema change (`value` stays opaque jsonb). */
  basis: "annual_return_due_date" | "accounting_period_end";
  label: string;
};
