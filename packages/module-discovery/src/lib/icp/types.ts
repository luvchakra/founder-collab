export type IcpStatus = "draft" | "approved";

export type IcpProfile = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  industries: string[];
  company_sizes: string[];
  geographies: string[];
  roles: string[];
  pain_points: string[];
  buying_signals: string[];
  exclusions: string[];
  status: IcpStatus;
  created_at: string;
  updated_at: string;
};
