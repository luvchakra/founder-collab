export type PaymentMethod = "cash" | "cheque" | "upi" | "bank" | "card_offline" | "other";

export interface Payment {
  id: string;
  business_id: string;
  party_id: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  id: string;
  business_id: string;
  payment_id: string;
  document_id: string;
  amount: number;
  created_at: string;
}

export interface DocumentBalance {
  document_id: string;
  business_id: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
}

export interface DocumentAging {
  document_id: string;
  business_id: string;
  party_id: string;
  doc_type: string;
  number: string | null;
  due_date: string;
  days_overdue: number;
  balance_amount: number;
  aging_bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}
