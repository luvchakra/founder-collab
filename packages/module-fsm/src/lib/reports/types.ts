export interface JobsCompletedRow {
  id: string;
  number: string | null;
  party_name: string;
  service_type_name: string | null;
  completed_at: string;
  invoiced_amount: number;
}

export interface RevenueByGroupRow {
  label: string;
  revenue: number;
}

export interface CustomerBalanceRow {
  party_id: string;
  party_name: string;
  balance_amount: number;
}

export interface AgingRow {
  document_id: string;
  party_name: string;
  number: string | null;
  due_date: string;
  days_overdue: number;
  balance_amount: number;
  aging_bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

export interface PaymentRow {
  id: string;
  party_name: string;
  method: string;
  amount: number;
  payment_date: string;
  reference: string | null;
  /** The fsm invoice this payment was allocated against, when resolvable -- lets the
   * report link a row straight to that invoice's own detail page. Null for a payment
   * spread across documents with no single one to link to. */
  document_id: string | null;
}

/** `from`/`to` are inclusive ISO dates (YYYY-MM-DD); either may be omitted for an
 * unbounded side. Applies only to reports with a natural date dimension -- customer
 * balances and account aging are current-state snapshots and ignore it. */
export interface ReportDateRange {
  from?: string;
  to?: string;
}

export interface TimecardRow {
  employee_name: string;
  total_hours: number;
  billable_hours: number;
  entry_count: number;
}

export interface ProductivityRow {
  employee_name: string;
  jobs_completed: number;
  total_hours: number;
}

export interface MarketingSourceRevenueRow {
  label: string;
  revenue: number;
}
