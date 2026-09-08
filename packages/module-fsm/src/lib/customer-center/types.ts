export interface CenterDocumentItem {
  id: string;
  doc_type: "estimate" | "invoice";
  number: string | null;
  status: string;
  total_amount: number;
  balance_amount: number;
  created_at: string;
}

export interface CenterUpcomingItem {
  id: string;
  starts_at: string;
  subject_label: string;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

/** Everything `/p/center/[token]` needs -- a customer's own estimates, invoices, and
 * upcoming scheduled work across every job/opportunity they have with this business
 * (PRD §2 Customer Center row MUST: "my estimates, my invoices, upcoming work"). No
 * "pay" action here -- an online payment link is a SHOULD/LATER item (PRD §2 Invoicing
 * row), same documented gap F-8's own public invoice page already has; "see balance" is
 * covered by each invoice's own `balance_amount`. */
export interface CustomerCenterView {
  businessName: string;
  businessWebsite: string | null;
  partyName: string;
  estimates: CenterDocumentItem[];
  invoices: CenterDocumentItem[];
  upcoming: CenterUpcomingItem[];
}
