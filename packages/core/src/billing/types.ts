export type CreditPurchaseStatus = "created" | "paid" | "failed";

export type CreditPurchase = {
  id: string;
  account_id: string;
  plan_key: string;
  credited_runs: number;
  amount_inr_paise: number;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  status: CreditPurchaseStatus;
  created_at: string;
  paid_at: string | null;
};

export type CreditBalance = {
  remaining_runs: number;
};
