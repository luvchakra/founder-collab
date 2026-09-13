/** DISC-OFFER-P0-06.1: the doc's own four-way classification, renamed from this field's
 * pre-existing values (`fact`/`inference`/`assumption`/`unknown`, blueprint §33) with the
 * doc's own display labels below -- the underlying values are unchanged, this is the
 * same distinction the module already made, now named for what it actually is (a claim's
 * *type*, not a confidence level -- see `EvidenceItem.confidence` below for the
 * genuinely separate confidence dimension). */
export type EvidenceType = "fact" | "inference" | "assumption" | "unknown";

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  fact: "Verified fact",
  inference: "Inference",
  assumption: "Hypothesis",
  unknown: "Insufficient evidence",
};

export type EvidenceConfidence = "low" | "medium" | "high";

export type EvidenceItem = {
  statement: string;
  /** What kind of source this is (e.g. "company website", "news article"), distinct
   * from `source_url` -- the doc lists both as separate fields. */
  source: string | null;
  source_url: string | null;
  /** Source date/observed date (doc's own field) -- free text, not a strict ISO date:
   * a model may only be able to say "early 2026" or "last quarter". */
  observed_at: string | null;
  /** Which buying signal or recent event (if any) this evidence backs -- the exact text
   * of one of `ProspectResearch.buying_signals`/`recent_events`, or null. Free text, not
   * a `discovery.signals` row id: evidence is produced before that table is ever
   * populated (`syncSignalsFromResearch`, 05.3, runs afterward, off this same research
   * row). */
  supporting_signal: string | null;
  evidence_type: EvidenceType;
  /** How confident the claim is accurate, independent of `evidence_type` -- see the
   * type's own doc comment. */
  confidence: EvidenceConfidence;
  /** DISC-OFFER-P0-12.2: "Clearly distinguish first-party website evidence from
   * external evidence" -- optional (not `| null`) because it's genuinely absent, not
   * merely unset, on any evidence item persisted before this story: `evidence` is a
   * jsonb array, so an older stored item's own object simply has no such key at all
   * rather than an explicit null. Every item a `research_prospect_v3`-or-later run
   * produces always sets one. */
  source_type?: "first_party" | "external";
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
  /** DISC-OFFER-P1 §7-03.2 "Research Cache" -- exact reference to the `discovery.ai_runs`
   * row that produced this research (provider/model/prompt version/input hash all live
   * there). Null for research written before this column existed, or if that `ai_runs`
   * row was ever pruned (`on delete set null`). */
  ai_run_id: string | null;
};
