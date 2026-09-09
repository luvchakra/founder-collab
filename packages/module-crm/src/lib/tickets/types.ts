export type TicketStatus = "open" | "pending" | "closed";

export type Ticket = {
  id: string;
  business_id: string;
  channel_id: string | null;
  party_id: string | null;
  assigned_to: string | null;
  subject: string | null;
  status: TicketStatus;
  /** Provider-side sender identifier (WhatsApp phone number, Instagram/Facebook/Google
   * Business Messages user id) an inbound webhook message resolved to -- null for
   * manually created tickets. See docs/design/crm-module-design.md Part A, A2. */
  external_sender_handle: string | null;
  /** What this ticket is actually about, if an agent has linked it (docs/design/
   * crm-module-design.md Part B, B2) -- a specific order/invoice, job, or gst
   * generation-history row owned by the named module. Both null or both set
   * together (tickets_related_module_requires_document). */
  related_module: "inventory" | "fsm" | "gst" | null;
  related_document_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};
