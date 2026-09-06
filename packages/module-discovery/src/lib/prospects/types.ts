export type ProspectStatus = "new" | "qualified" | "disqualified";

/** "open" until a conversation with this prospect is closed (docs: Conversations
 * redesign) -- set to "won" or "lost" at that point. Separate from `status` (a
 * qualification judgment made early in the pipeline): outcome is the deal result, and a
 * prospect can have conversations across multiple channels, so it lives here rather than
 * on any one conversation. */
export type ProspectOutcome = "open" | "won" | "lost";

export type Prospect = {
  id: string;
  workspace_id: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  company_size: string | null;
  location: string | null;
  description: string | null;
  status: ProspectStatus;
  outcome: ProspectOutcome;
  fit_score: number | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  company_email: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectSuggestion = {
  id: string;
  workspace_id: string;
  company_name: string;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  location: string | null;
  description: string | null;
  match_reason: string | null;
  source_url: string | null;
  created_at: string;
};
