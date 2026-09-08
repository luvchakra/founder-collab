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
