export type EvidenceConfidence = "fact" | "inference" | "assumption" | "unknown";

export type EvidenceItem = {
  claim: string;
  source_url: string | null;
  confidence: EvidenceConfidence;
};

export type ProspectResearch = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  summary: string | null;
  pain_points: string[];
  buying_signals: string[];
  recent_events: string[];
  recommended_angle: string | null;
  evidence: EvidenceItem[];
  researched_at: string;
  expires_at: string | null;
};
