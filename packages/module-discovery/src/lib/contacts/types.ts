export type ContactStatus = "active" | "inactive";

export type Contact = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
};
