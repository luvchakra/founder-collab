/** DISC-OFFER-P0-05.3: "Multi-Signal Correlation" -- atomic, addressable buying-signal
 * facts about a prospect. Previously these only existed as free-text strings inside
 * `prospect_research.buying_signals`/`recent_events` -- no stable id, nothing a
 * correlation could reference by "supporting signal IDs" the way the backlog's own
 * acceptance criteria require. A `Signal` row is that stable reference point. */
export type SignalType = "buying_signal" | "recent_event";

export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  buying_signal: "Buying signal",
  recent_event: "Recent event",
};

export type Signal = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  signal_type: SignalType;
  description: string;
  source: string | null;
  observed_at: string;
  created_at: string;
};

export type CorrelationConfidence = "low" | "medium" | "high";

/** The correlated read over a prospect's own signals -- "supporting signal IDs,
 * rationale, confidence, time context" (doc's own literal list). Append-only: a
 * re-correlation is a new row, matching `prospect_scores`' own precedent, not an
 * overwrite of the last one. */
export type SignalCorrelation = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  signal_ids: string[];
  rationale: string;
  confidence: CorrelationConfidence;
  earliest_signal_at: string;
  latest_signal_at: string;
  created_at: string;
};
