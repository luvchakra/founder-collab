/** DISC-OFFER-P0-05.5: "Negative Signals" -- the doc's own literal nine reasons a
 * prospect may reduce an opportunity's quality. Seven are automatically detectable from
 * data this module already has (`source: "auto"`, via `detectNegativeSignals` in
 * detect.ts); two -- `known_incompatible_solution` (no competitor/tooling knowledge
 * exists anywhere in Discovery today) and `existing_active_relationship` (needs CRM
 * data, which DISC-OFFER-P0-08.2 "Existing Relationship Detection" explicitly owns) --
 * are `source: "manual"` only, recorded by a caller who has that context rather than
 * guessed at here. */
export type NegativeSignalReason =
  | "wrong_industry"
  | "wrong_size"
  | "wrong_geography"
  | "no_relevant_problem"
  | "known_incompatible_solution"
  | "recent_rejection"
  | "no_buyer"
  | "existing_active_relationship"
  | "insufficient_evidence";

export const NEGATIVE_SIGNAL_REASON_LABEL: Record<NegativeSignalReason, string> = {
  wrong_industry: "Wrong industry",
  wrong_size: "Wrong company size",
  wrong_geography: "Wrong geography",
  no_relevant_problem: "No relevant problem",
  known_incompatible_solution: "Known incompatible solution",
  recent_rejection: "Recent rejection",
  no_buyer: "No buyer",
  existing_active_relationship: "Existing active relationship",
  insufficient_evidence: "Insufficient evidence",
};

export type NegativeSignalSource = "auto" | "manual";

export type NegativeSignal = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  reason: NegativeSignalReason;
  /** "Show the reason to the user" (doc's own words) -- the human-readable specifics
   * behind the closed-vocabulary `reason`, e.g. which ICP industries didn't match. */
  detail: string | null;
  source: NegativeSignalSource;
  detected_at: string;
  created_at: string;
};
