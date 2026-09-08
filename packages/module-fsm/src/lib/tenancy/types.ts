export interface Business {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
}
