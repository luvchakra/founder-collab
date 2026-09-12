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
  /** DISC-OFFER-P0-13.1: "Structured Stage Outputs" -- the doc's own worked ICP example
   * names `confidence`/`evidence` alongside the list fields above; both are nullable/
   * empty rather than defaulted, since a row created before this story (or since edited
   * by hand -- see `updateIcpProfile`) has genuinely never had either computed, which is
   * a different fact from "computed and found unconfident/unsupported." `evidence` is a
   * plain array of short quotes/paraphrases from the product profile, not the richer
   * `EvidenceItem` shape research/buyer-intelligence use -- see the migration's own
   * comment for why that fuller shape doesn't fit a single-call ICP synthesis. */
  confidence: number | null;
  evidence: string[];
  status: IcpStatus;
  created_at: string;
  updated_at: string;
};
