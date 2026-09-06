export type ProspectScore = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  icp_score: number;
  intent_score: number;
  timing_score: number;
  overall_score: number;
  reasoning: string | null;
  created_at: string;
};
