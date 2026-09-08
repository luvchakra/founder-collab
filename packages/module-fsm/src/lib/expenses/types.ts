export interface Expense {
  id: string;
  business_id: string;
  job_id: string;
  vendor_party_id: string | null;
  item_id: string | null;
  description: string;
  amount: number;
  incurred_on: string;
  employee_id: string | null;
  attachment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  incurredOn?: string;
}
