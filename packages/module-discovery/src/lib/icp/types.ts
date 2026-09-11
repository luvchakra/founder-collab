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
  /** DISC-OFFER-P0-02.2's own field-list additions -- the backlog's "revenue/business
   * model/technology/growth stage/existing tools" beyond what this table already had. */
  revenue: string[];
  business_model: string[];
  technology: string[];
  growth_stage: string[];
  existing_tools: string[];
  status: IcpStatus;
  created_at: string;
  updated_at: string;
};
