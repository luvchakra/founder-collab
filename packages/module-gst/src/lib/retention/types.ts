export type GstRecordRetentionRuleValue = {
  months: number;
  /** What the retention period counts FROM -- today only ever `"annual_return_due_date"`
   * (Section 36 of the CGST Act), but named explicitly rather than assumed, matching
   * every other rule value in this module that isn't self-evidently a bare number. */
  basis: "annual_return_due_date";
  label: string;
};
