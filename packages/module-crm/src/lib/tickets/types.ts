export type TicketStatus = "open" | "pending" | "closed";

export type Ticket = {
  id: string;
  business_id: string;
  channel_id: string | null;
  party_id: string | null;
  assigned_to: string | null;
  subject: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
};

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};
