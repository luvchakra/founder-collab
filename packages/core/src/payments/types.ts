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
  /** SEC-7: a payment is never edited or deleted, only voided -- see `voidPayment`. */
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  /** What the payment had settled when it was voided; its live allocations are released. */
  voided_allocations: VoidedAllocation[] | null;
}

export interface VoidedAllocation {
  allocation_id: string;
  document_id: string;
  amount: number;
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
